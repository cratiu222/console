"use client";
import React, { Dispatch, useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Alert, Button, Spinner } from "@akashnetwork/ui/components";
import cloneDeep from "lodash/cloneDeep";
import { nanoid } from "nanoid";

import { useSdlBuilder } from "@src/context/SdlBuilderProvider/SdlBuilderProvider";
import { useGpuModels } from "@src/queries/useGpuQuery";
import { SdlBuilderFormValues, Service } from "@src/types";
import { defaultService, defaultSshVMService } from "@src/utils/sdl/data";
import { generateSdl } from "@src/utils/sdl/sdlGenerator";
import { importSimpleSdl } from "@src/utils/sdl/sdlImport";
import { transformCustomSdlFields, TransformError } from "@src/utils/sdl/transformCustomSdlFields";
import { SimpleServiceFormControl } from "../sdl/SimpleServiceFormControl";

interface Props {
  sdlString: string | null;
  setEditedManifest: Dispatch<string>;
}

export type SdlBuilderRefType = {
  getSdl: () => string | undefined;
  validate: () => Promise<boolean>;
};

export const SdlBuilder = React.forwardRef<SdlBuilderRefType, Props>(({ sdlString, setEditedManifest }, ref) => {
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isInit, setIsInit] = useState(false);
  const { hasComponent } = useSdlBuilder();
  const { control, trigger, watch, setValue } = useForm<SdlBuilderFormValues>({
    defaultValues: {
      services: [cloneDeep(hasComponent("ssh") ? defaultSshVMService : defaultService)]
    }
  });
  const {
    fields: services,
    remove: removeService,
    append: appendService
  } = useFieldArray({
    control,
    name: "services",
    keyName: "id"
  });
  const { services: _services = [] } = watch();
  const { data: gpuModels } = useGpuModels();
  const [serviceCollapsed, setServiceCollapsed] = useState([]);

  React.useImperativeHandle(ref, () => ({
    getSdl: getSdl,
    validate: async () => {
      return await trigger();
    }
  }));

  useEffect(() => {
    const { unsubscribe } = watch(data => {
      const sdl = generateSdl(data.services as Service[]);
      setEditedManifest(sdl);
    });

    try {
      if (sdlString) {
        const services = createAndValidateSdl(sdlString);
        setValue("services", services as Service[]);
      }
    } catch (error) {
      setError("Error importing SDL");
    }

    setIsInit(true);

    return () => {
      unsubscribe();
    };
  }, [watch]);

  const getSdl = () => {
    try {
      return generateSdl(transformCustomSdlFields(_services, { withSSH: hasComponent("ssh") }));
    } catch (err) {
      if (err instanceof TransformError) {
        setError(err.message);
      }
    }
  };

  const createAndValidateSdl = (yamlStr: string) => {
    try {
      if (!yamlStr) return [];

      const services = importSimpleSdl(yamlStr);

      setError(null);

      return services;
    } catch (err) {
      if (err.name === "YAMLException" || err.name === "CustomValidationError") {
        setError(err.message);
      } else if (err.name === "TemplateValidation") {
        setError(err.message);
      } else {
        setError("Error while parsing SDL file");
        console.error(err);
      }
    }
  };

  const onAddService = () => {
    appendService({ ...defaultService, id: nanoid(), title: `service-${services.length + 1}` });
  };

  const onRemoveService = (index: number) => {
    removeService(index);
  };

  return (
    <div className="pb-8">
      {!isInit ? (
        <div className="flex items-center justify-center p-8">
          <Spinner size="large" />
        </div>
      ) : (
        <form ref={formRef} autoComplete="off">
          {_services &&
            services.map((service, serviceIndex) => (
              <SimpleServiceFormControl
                key={service.id}
                serviceIndex={serviceIndex}
                gpuModels={gpuModels}
                setValue={setValue}
                _services={_services as Service[]}
                control={control}
                trigger={trigger}
                onRemoveService={onRemoveService}
                serviceCollapsed={serviceCollapsed}
                setServiceCollapsed={setServiceCollapsed}
                hasSecretOption={false}
              />
            ))}

          {error && (
            <Alert variant="destructive" className="mt-4">
              {error}
            </Alert>
          )}

          {!hasComponent("ssh") && (
            <div className="flex items-center justify-end pt-4">
              <div>
                <Button variant="default" size="sm" type="button" onClick={onAddService}>
                  Add Service
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
});

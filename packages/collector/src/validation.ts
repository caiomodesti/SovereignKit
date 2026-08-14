import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";

import type { SignedProbeResult } from "@sovereignkit/probes";

const addFormats = addFormatsModule.default as unknown as (ajv: Ajv2020) => Ajv2020;

export type ProbeResultValidation =
  | { readonly valid: true; readonly value: SignedProbeResult }
  | { readonly valid: false; readonly errors: readonly string[] };

export class ProbeResultSchemaValidator {
  readonly #validate: ValidateFunction;

  constructor(schema: object) {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    addFormats(ajv);
    this.#validate = ajv.compile(schema);
  }

  validate(value: unknown): ProbeResultValidation {
    if (this.#validate(value)) return { valid: true, value: value as SignedProbeResult };
    return { valid: false, errors: (this.#validate.errors ?? []).map(formatError) };
  }
}

function formatError(error: ErrorObject): string {
  const location = error.instancePath.length === 0 ? "/" : error.instancePath;
  return `${location} ${error.message ?? error.keyword}`;
}

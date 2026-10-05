// Checking a GLB with the Khronos glTF Validator: { errors, warnings, infos, messages }

import validator from "gltf-validator";

const SEVERITY = ["error", "warning", "info", "hint"];

/**
 * Validates a GLB's bytes. `ignore` lists issue codes not counted (those a known extension the
 * validator can't read brings, for one).
 */
export async function validate(bytes, { ignore = [] } = {}) {
    const result = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 200, ignoredIssues: ignore, writeTimestamp: false });
    const { numErrors, numWarnings, numInfos, messages } = result.issues;

    return {
        validator: result.validatorVersion,
        errors: numErrors,
        warnings: numWarnings,
        infos: numInfos,
        messages: messages
            .filter((message) => message.severity <= 1)
            .slice(0, 20)
            .map((message) => `${SEVERITY[message.severity]} ${message.code}: ${message.message}${message.pointer ? ` (${message.pointer})` : ""}`),
    };
}

// Checking a GLB with the Khronos glTF Validator: { errors, warnings, infos, messages }

import validator from "gltf-validator";

const SEVERITY = ["error", "warning", "info", "hint"];

// What this validator says of KTX2 images (KHR_texture_basisu), which it doesn't know: that
// image/ktx2 isn't a mime type it lists, and that it can't read the image
const KTX2_UNREAD = (message) => message.code === "IMAGE_UNRECOGNIZED_FORMAT" || (message.code === "VALUE_NOT_IN_LIST" && message.message.includes("image/ktx2"));

/**
 * Validates a GLB's bytes. `ignore` lists issue codes not counted (those a known extension the
 * validator can't read brings, for one); `ktx2`, that its images are KTX2, whose issues this
 * validator raises only for not knowing them aren't counted either.
 */
export async function validate(bytes, { ignore = [], ktx2 = false } = {}) {
    const result = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 200, ignoredIssues: ignore, writeTimestamp: false });
    const { numErrors, numWarnings, numInfos } = result.issues;
    const unread = ktx2 ? result.issues.messages.filter(KTX2_UNREAD) : [];
    const messages = result.issues.messages.filter((message) => !unread.includes(message));

    return {
        validator: result.validatorVersion,
        errors: numErrors - unread.filter((message) => message.severity === 0).length,
        warnings: numWarnings - unread.filter((message) => message.severity === 1).length,
        infos: numInfos,
        messages: messages
            .filter((message) => message.severity <= 1)
            .slice(0, 20)
            .map((message) => `${SEVERITY[message.severity]} ${message.code}: ${message.message}${message.pointer ? ` (${message.pointer})` : ""}`),
    };
}

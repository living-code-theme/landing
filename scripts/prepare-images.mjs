import { fileURLToPath } from "node:url";
import { prepareImages } from "../src/lib/prepare-images.mjs";

const result = await prepareImages(fileURLToPath(new URL("../", import.meta.url)));
console.log(`Screenshot variants: ${result.captures} captures, ${result.variants} variants, ${result.downloaded} downloads, ${result.uploaded} uploads.`);

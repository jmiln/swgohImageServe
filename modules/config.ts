import { z } from "zod";

const envSchema = z.object({
    PORT: z.coerce.number().int().positive(),
    ASSET_PORT: z.coerce.number().int().positive().optional(),
    COMLINK_CLIENT_URL: z.string().refine((v) => URL.canParse(v), { message: "COMLINK_URL must be a valid URL" }),
    COMLINK_ACCESS_KEY: z.string().min(1),
    COMLINK_SECRET_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);

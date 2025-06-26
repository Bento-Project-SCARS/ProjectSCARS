import { pino, type Logger } from "pino";

const config =
    process.env.NODE_ENV === "production"
        ? {
              level: process.env.PINO_LOG_LEVEL || "info",
              redact: [], // prevent logging of sensitive data
          }
        : {
              transport: {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                  },
              },
              level: process.env.PINO_LOG_LEVEL || "debug",
              redact: [], // prevent logging of sensitive data
          };

export const logger: Logger = pino(config);

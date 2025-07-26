import type { JestConfigWithTsJest } from "ts-jest";

const config: JestConfigWithTsJest = {
    preset:                 "ts-jest/presets/default-esm",
    testEnvironment:        "node",
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper:       {
        "^(\\.{1,2}/.*)\\.js$": "$1"
    },
    transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true
            }
        ]
    },
    rootDir: "test",
    verbose: true
};

export default config;

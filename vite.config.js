"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path_1 = require("path");
var fullstack_vite_preset_1 = require("@lark-apaas/fullstack-vite-preset");
exports.default = (0, fullstack_vite_preset_1.defineConfig)({
    resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, 'client/src'),
        },
    },
});

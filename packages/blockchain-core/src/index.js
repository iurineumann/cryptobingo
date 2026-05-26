"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchPlayerBalance = exports.fetchPlayerTickets = exports.fetchGame = exports.rpcClient = void 0;
// Exporta o cliente base caso algum serviço precise fazer queries avançadas não mapeadas
var client_1 = require("./client");
Object.defineProperty(exports, "rpcClient", { enumerable: true, get: function () { return client_1.rpcClient; } });
// Exporta as funções fortemente tipadas
var client_2 = require("./client");
Object.defineProperty(exports, "fetchGame", { enumerable: true, get: function () { return client_2.fetchGame; } });
Object.defineProperty(exports, "fetchPlayerTickets", { enumerable: true, get: function () { return client_2.fetchPlayerTickets; } });
Object.defineProperty(exports, "fetchPlayerBalance", { enumerable: true, get: function () { return client_2.fetchPlayerBalance; } });
//# sourceMappingURL=index.js.map
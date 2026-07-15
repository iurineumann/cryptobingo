import './module-alias.js';
import { startServer } from './azure-functions-shim.js';

import './health.js';
import './subscribe.js';
import './stats.js';
import './stats_game.js';
import './ideas/index.js';
import './ideas/vote.js';
import './votes/confirm.js';
import './admin/login.js';
import './admin/confirm.js';
import './admin/newsletter.js';
import './admin/ideas.js';
import './admin/subscribers.js';

const PORT = Number(process.env.PORT ?? 8080);
startServer(PORT);

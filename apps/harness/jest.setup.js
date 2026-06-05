const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.waxdev.env') });
dotenv.config({ path: path.resolve(__dirname, '../worker-game-loop/.env') });

import 'dotenv/config';
import { loadConfig } from '../shared/config';

const config = loadConfig();
console.log(`Config loaded (port ${config.port})`);

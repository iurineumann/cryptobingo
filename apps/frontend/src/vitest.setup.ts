// Polyfills necessários para @wharfkit/antelope rodar em jsdom
import { TextEncoder, TextDecoder } from 'util';
Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// cleanup desmonta componentes entre testes — necessário no vitest com globals:true
afterEach(cleanup);

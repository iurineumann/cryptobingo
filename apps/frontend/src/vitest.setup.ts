// Polyfills necessários para @wharfkit/antelope rodar em jsdom
import { TextEncoder, TextDecoder } from 'util';
Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder });

import '@testing-library/jest-dom';

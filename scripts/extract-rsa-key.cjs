#!/usr/bin/env node
// scripts/extract-rsa-key.cjs
// Extrai exponent e modulus de uma chave pública RSA PEM como hex strings.
// Saída: JSON { exponent: "010001", modulus: "c61c..." }
// Uso: node scripts/extract-rsa-key.cjs <caminho-para-public.pem>

'use strict';

const crypto = require('node:crypto');
const fs     = require('node:fs');

const pemPath = process.argv[2];
if (!pemPath) {
    console.error('Uso: node scripts/extract-rsa-key.cjs <public.pem>');
    process.exit(1);
}

const pem = fs.readFileSync(pemPath, 'utf-8');
const key = crypto.createPublicKey(pem);
const jwk = key.export({ format: 'jwk' });

if (!jwk.n || !jwk.e) {
    console.error('Falha ao extrair chave RSA do PEM.');
    process.exit(1);
}

const modulus  = Buffer.from(jwk.n, 'base64url').toString('hex');
const exponent = Buffer.from(jwk.e, 'base64url').toString('hex');

// Garante tamanho par (hex)
const expHex = exponent.length % 2 ? '0' + exponent : exponent;
const modHex = modulus.length  % 2 ? '0' + modulus  : modulus;

console.log(JSON.stringify({ exponent: expHex, modulus: modHex }));

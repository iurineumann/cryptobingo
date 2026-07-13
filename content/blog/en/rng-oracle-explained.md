---
title: "How CryptoBingo's RNG Oracle Ensures Provably Fair Draws"
description: "Deep dive into the RSA-SHA256 oracle powering every draw"
date: "2026-06-15"
author: "CryptoBingo Engineering"
tags: ["technical", "security", "rng"]
---

## The Trust Problem

Traditional online bingo relies on centralized random number generators. Players must trust that the house isn't manipulating results. CryptoBingo solves this with an on-chain RSA-SHA256 oracle.

## How It Works

Before each draw, the oracle generates a random seed and publishes its SHA-256 hash to the blockchain as a commitment. The actual seed remains secret until the draw completes.

Once all balls are drawn, the oracle reveals the seed on-chain. Anyone can verify that:
1. The revealed seed hashes to the previously committed hash
2. The seed deterministically produced the drawn numbers

This is the same cryptographic commitment pattern used in decentralized finance and provably fair casinos.

## Why RSA-SHA256?

RSA provides asymmetric signing — the oracle signs commitments with its private key, and anyone can verify with the public key. SHA-256 ensures collision resistance. Combined, they provide tamper-proof randomness that no single party can manipulate.

## Verifying Draws

You can verify any draw using our open-source verifier tool. The RNG source code is available on GitHub for community audit. Every draw's commitment and reveal transaction IDs are displayed in the game UI.

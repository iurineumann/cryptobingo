---
title: "Como o Oracle RNG do CryptoBingo Garante Sorteios Justos"
description: "Mergulho técnico no oracle RSA-SHA256 que alimenta cada sorteio"
date: "2026-06-15"
author: "Engenharia CryptoBingo"
tags: ["tecnico", "seguranca", "rng"]
---

## O Problema da Confiança

O bingo online tradicional depende de geradores de números aleatórios centralizados. Os jogadores precisam confiar que a casa não está manipulando resultados. O CryptoBingo resolve isso com um oracle RSA-SHA256 on-chain.

## Como Funciona

Antes de cada sorteio, o oracle gera uma semente aleatória e pública seu hash SHA-256 na blockchain como compromisso. A semente real permanece secreta até o sorteio ser concluído.

Após todas as bolas serem sorteadas, o oracle revela a semente on-chain. Qualquer um pode verificar que:
1. A semente revelada corresponde ao hash previamente comprometido
2. A semente produziu deterministicamente os números sorteados

## Por que RSA-SHA256?

RSA fornece assinatura assimétrica — o oracle assina compromissos com sua chave privada e qualquer um verifica com a chave pública. SHA-256 garante resistência a colisões. Combinados, fornecem aleatoriedade à prova de adulteração.

## Verificando Sorteios

Você pode verificar qualquer sorteio usando nossa ferramenta de verificação open-source. O código-fonte do RNG está disponível no GitHub para auditoria da comunidade.

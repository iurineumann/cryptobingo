<h1 class="contract">setconfig</h1>
### Intent
The purpose of the `setconfig` action is to initialize or update the cryptographic signing authority of the CryptoBingo off-chain microservice.

### Terms
I, the contract administrator, declare that by submitting the public key {{signer_key}}, I formally authorize the corresponding microservice to cryptographically sign ticket matrices generated off-chain. This key shall be the sole authority accepted by `assert_recover_key` within the `buytickets` action. I acknowledge that updating this key invalidates all previously signed but unsubmitted ticket matrices.

---

<h1 class="contract">creategame</h1>
### Intent
The purpose of the `creategame` action is to schedule a new autonomous bingo round, creating it in the `created` state without immediately opening ticket sales.

### Terms
I, the contract administrator, declare that by instantiating game {{game_id}} with ticket price {{ticket_price}} under gametype {{gametype_id}}, the contract allocates a new state entry with initial status `created`. Ticket sales will not open until `fundgame` is explicitly invoked by the authorized microservice. I declare that the treasury holds sufficient liquidity to cover potential payouts for this round based on the Law of Large Numbers and the Monte Carlo simulation performed prior to gametype registration.

---

<h1 class="contract">fundgame</h1>
### Intent
The purpose of the `fundgame` action is to open ticket sales for a scheduled game by transitioning its status from `created` to `funding`.

### Terms
This action, authorized exclusively by the microservice account, transitions game {{game_id}} from `created` to `funding`. From this block forward, players may purchase tickets. The microservice assumes operational responsibility for invoking `lockgame` within the scheduled sales window to prevent unbounded ticket issuance.

---

<h1 class="contract">lockgame</h1>
### Intent
The purpose of the `lockgame` action is to permanently close ticket sales for a game, transitioning it from `funding` to `locked`.

### Terms
This action, authorized exclusively by the microservice account, transitions game {{game_id}} from `funding` to `locked`. No new ticket purchases will be accepted from this consensus block forward. This action protects the mathematical integrity of the imminent draw by ensuring a fixed and immutable set of participants.

---

<h1 class="contract">startdraw</h1>
### Intent
The purpose of the `startdraw` action is to formally initiate the provably fair draw by requesting verifiable randomness from the WAX Network Oracle.

### Terms
This action transitions game {{game_id}} to `drawing` status and dispatches an inline asynchronous request to the `orng.wax` system contract, using the game ID as the association seed. The final draw result is exclusively and irrevocably determined by the oracle's entropy output and cannot be influenced, delayed, or manipulated by the contract operator, block producers, or any other party after this action is broadcast.

---

<h1 class="contract">receiverand</h1>
### Intent
The purpose of the `receiverand` action is to receive and permanently record the official 75-ball entropy vector delivered by the WAX RNG Oracle.

### Terms
This action exclusively accepts inline requests originating from the `orng.wax` system contract. The entropy bytes injected as `random_bytes` are recorded immutably as the official draw result for game {{assoc_id}}, transitioning its status to `drawn`. The deterministic 75-ball sequence derived from this entropy is the sole and final basis for all win evaluations in this round. No party may dispute this result after this action is confirmed.

---

<h1 class="contract">claimwin</h1>
### Intent
The purpose of the `claimwin` action is to audit a winning ticket via Boolean bitmasking algebra (O(1) complexity) and instantly credit the Fixed-Odds prize to the corresponding player's internal balance.

### Terms
This action, invoked under microservice authorization, validates that ticket {{ticket_id}} in game {{game_id}} has satisfied the win pattern bitmask {{win_pattern_mask}} given {{ball_count}} officially drawn balls from the oracle-provided sequence. The contract applies the applicable gametype multipliers according to the formula:

  Prize = ticket_price × base_multiplier × win_pattern_weight

The net prize amount is credited instantly and atomically to the winner's `balances` entry. The game status transitions to `archived` and `end_time` is permanently recorded to initiate the mandatory 24-hour audit quarantine period before RAM can be released.

---

<h1 class="contract">abortgame</h1>
### Intent
The purpose of the `abortgame` action is to activate the fail-safe mechanism when the oracle does not respond within the allowed window, or when an administrative halt is required for compliance reasons.

### Terms
This action transitions game {{game_id}} to `aborted` status with the declared reason {{reason}} and permanently records `end_time`. From this consensus block forward, the `refundticket` action becomes available to all participants regardless of platform availability. The operator irrevocably declares that no player funds will be retained under an aborted game, and that all participants are entitled to a full refund of their ticket purchase price. This action is compatible with Article 4 of COMPLIANCE.md and the consumer protection provisions of Brazilian Law 14.790/2023.

---

<h1 class="contract">refundticket</h1>
### Intent
The purpose of the `refundticket` action is to provide a permissionless, O(1) self-service refund mechanism for players when a game is aborted, guaranteeing fund recovery without requiring any platform intervention.

### Terms
This action may be invoked by any account on the WAX network without restriction. It verifies that game {{game_id}} is in `aborted` status, credits the full `ticket_price` of ticket {{ticket_id}} to the original owner's internal balance, and permanently erases the ticket row from the contract's RAM. Players retain full and unconditional autonomy to claim their refund independently, even if the CryptoBingo platform, its API, or its microservice are unavailable. This design is intentional and constitutes a consumer protection guarantee.

---

<h1 class="contract">cleargame</h1>
### Intent
The purpose of the `cleargame` action is to release contract RAM by iteratively erasing ticket rows after the mandatory audit quarantine period has elapsed.

### Terms
This action erases up to {{max_rows}} ticket rows from game {{game_id}} in a single invocation to respect the WAX block CPU budget (~30ms execution limit). It must be called repeatedly until all rows are erased. For games in `archived` status, a mandatory 24-hour quarantine window after `end_time` must have elapsed before this action succeeds. For games in `aborted` status, no quarantine period is required. Upon complete erasure of all ticket rows, the game record itself is also permanently erased, and all allocated RAM is returned to the operator treasury.

---

<h1 class="contract">setnftconf</h1>
### Intent
The purpose of the `setnftconf` action is to dynamically register or update the in-game utility rights associated with a specific AtomicAssets NFT template.

### Terms
I, the contract administrator, associate template {{template_id}} with a {{discount_pct}}% discount on ticket purchases. This benefit is valid until the UNIX timestamp {{valid_until}} (where 0 represents a perpetual, non-expiring benefit). VIP access rights are set to {{is_vip}}. I acknowledge that this configuration applies globally to all holders of this template ID at the moment of `buytickets` invocation.

---

<h1 class="contract">delnftconf</h1>
### Intent
The purpose of the `delnftconf` action is to permanently revoke the on-chain utility configuration of a specific NFT template.

### Terms
I, the contract administrator, permanently remove the promotional configuration for template {{template_id}}. From this consensus block forward, ownership of NFTs under this template ID shall not grant any discounts or VIP benefits on new ticket purchases. Existing purchased tickets are not affected.

---

<h1 class="contract">addpattern</h1>
### Intent
The purpose of the `addpattern` action is to register or update a bitmask representing a specific geometric win pattern for bingo card evaluation.

### Terms
By submitting pattern {{pattern_id}} with the descriptive name {{name}} and the 25-bit bitmask {{mask}}, I establish a geometric validation invariant in the contract's `patterns` table. This mask is used in O(1) bitwise AND operations to determine winning tickets. The bitmask layout follows the column-major 5x5 grid specification defined in SPEC.md §3.3. The mask must not exceed 25 bits and must accurately represent the intended geometric pattern.

---

<h1 class="contract">delpattern</h1>
### Intent
The purpose of the `delpattern` action is to permanently remove a registered geometric win pattern from the contract.

### Terms
I, the contract administrator, permanently remove pattern {{pattern_id}} from the contract's `patterns` table. Active games referencing this pattern through their linked gametype will not be affected. However, any gametype referencing this pattern must be updated or removed before new games are created with it, as the pattern validation check in `addgametype` will reject references to non-existent pattern IDs.

---

<h1 class="contract">addgametype</h1>
### Intent
The purpose of the `addgametype` action is to register or update a game mode that consolidates the economic rules, base multiplier, and win pattern weights governing a category of bingo rounds.

### Terms
By registering gametype {{gametype_id}} under the name {{name}} with base multiplier {{base_multiplier}} and the specified pattern rules, I authorize the treasury to assume financial exposure calculated by the formula:

  Prize = ticket_price × base_multiplier × max_pattern_weight

where max_pattern_weight is the highest weight among all satisfied win patterns for a given ticket (Max-Weight Payout Rule, ADR-005). I certify that a Monte Carlo simulation has been performed prior to registration to ensure the configured RTP remains within the 75%–98% sustainability range.

---

<h1 class="contract">delgametype</h1>
### Intent
The purpose of the `delgametype` action is to permanently remove a game mode from the contract's active configurations.

### Terms
I, the contract administrator, permanently remove gametype {{gametype_id}} from the contract's `gametypes` table. Existing games already linked to this gametype will continue to function correctly until their natural conclusion. No new games may be instantiated referencing this gametype ID after this action is confirmed.

---

<h1 class="contract">buytickets</h1>
### Intent
The purpose of the `buytickets` action is to allow a player to acquire one or more legitimate, cryptographically-verified bingo tickets for an active game by debiting their custodied internal balance.

### Terms
I, {{buyer}}, authorize the deduction of the total cost of the submitted ticket matrices for game {{game_id}} from my internal balance table in this contract. I acknowledge that:

1. Each matrix in the `matrices` array has been generated and cryptographically signed off-chain by the platform's authorized backend using the key registered via `setconfig`.
2. If I have provided NFT asset ID {{nft_id}}, the applicable AtomicAssets discount rules will be enforced by the contract at the time of this action.
3. The integrity of each ticket matrix is guaranteed by the `assert_recover_key` validation embedded in this action. Any matrix with an invalid or mismatched signature will cause the entire transaction to fail and roll back.
4. Once successfully recorded on-chain, my ticket matrices are immutable and constitute my entry into the draw.

---

<h1 class="contract">linkcampaign</h1>
### Intent
The purpose of the `linkcampaign` action is to inject a sponsorship allocation from a registered campaign into a specific game's sponsor pool, establishing a trustless B2B prize enhancement.

### Terms
By linking campaign {{campaign_id}} to game {{game_id}}, the configured `payout_per_game` amount is atomically transferred from the campaign's `balance_remaining` into the game's `sponsor_pool`. This action requires the game to be in `created` or `funding` status. Once linked, the sponsor's allocated funds are irrevocably committed to this game. They will be distributed to the winning ticket holder atomically within `claimwin`, or returned to the sponsor (or directed to the treasury) according to the campaign's `leftover_policy` upon `closecampaign`.

---

<h1 class="contract">closecampaign</h1>
### Intent
The purpose of the `closecampaign` action is to finalize a B2B sponsorship campaign by settling its residual balance according to the pre-defined leftover policy and permanently erasing the campaign record.

### Terms
By closing campaign {{campaign_id}}, the residual `balance_remaining` is settled as follows:

- If `leftover_policy` is `refund`: all remaining tokens are transferred back to the `sponsor` account via an inline `eosio.token::transfer`.
- If `leftover_policy` is `house`: all remaining tokens remain within the contract treasury.

The campaign record is then permanently erased from the `campaigns` table. This action may only be invoked by the contract administrator or the campaign's original sponsor account.

---

<h1 class="contract">withdraw</h1>
### Intent
The purpose of the `withdraw` action is to liquidate and transfer a player's funds from the contract's internal custody ledger to their native WAX network account.

### Terms
I, {{owner}}, instruct the contract to deduct exactly {{amount}} from my `balances` entry and dispatch an inline `eosio.token::transfer` of the corresponding token and amount to my account. I acknowledge that this action requires my `active` permission signature, that the deduction and transfer are atomic (either both succeed or both fail), and that once confirmed, the transfer is final and irreversible on the WAX blockchain.

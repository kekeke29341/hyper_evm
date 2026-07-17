# 2026-07-05 Vault idle KHYPE incident

## 概要

2026-07-05 に Mainnet 999 の本番 Vault で、ユーザー入金後に一部資産が Project X LP ポジションへ投入されず、Vault 本体に idle KHYPE / USDC として残っていることを確認した。

資金は失われていない。idle 資産は `totalAssetsUsdc()` に含まれており、Vault shares の NAV と出金可能額に反映される。ただし、idle 資産は Project X LP のスワップ手数料を獲得しないため、ユーザーが期待する収益効率を満たしていない。

## 現在の対象

| 項目 | 値 |
|---|---|
| Chain | HyperEVM Mainnet `999` |
| Vault | `0x03cF822d0192D687cBDc2fAe6B8492a27634aD99` |
| Adapter | `0x1A347c716721548C298B426aD90dfbb8B5BF328d` |
| Project X Pool | `0x422e586C906eb241f784B4F5a633c2C7e59A2F54` |
| NPM position | `510884` |
| 1万 USDC 入金 tx | `0x45bce958de307c6bf909f0a1b788636f6164789f48d70a124fa05d8e7d4e6393` |

## 確認済みオンチェーン状態

2026-07-05 20:30 JST 前後の確認値。

| 項目 | 値 |
|---|---:|
| Vault `totalAssetsUsdc()` | `24435.881005 USDC` |
| Adapter LP 評価額 | `14767.889354 USDC` |
| Adapter idle | `0 USDC` 相当 |
| Vault idle USDC | `174.719469 USDC` |
| Vault idle KHYPE | `137.772431951667112846 KHYPE` |
| Vault idle KHYPE 評価額 | 約 `9465.610753 USDC` |
| 対象入金者の推定持分価値 | 約 `10046.625931 USDC` |

LP ポジション自体は存在し、現在価格はレンジ内にある。

| 項目 | 値 |
|---|---:|
| positionId | `510884` |
| position liquidity | `8414987985256749` |
| current pool tick | `-234024` |
| position tick lower | `-237600` |
| position tick upper | `-233040` |
| fee tier | `3000` (`0.3%`) |
| 現在レンジ内か | Yes |

つまり、LP に投入済みの部分は手数料を獲得している。一方で、Vault 本体に残った idle KHYPE / USDC は手数料を獲得していない。

## 影響

- ユーザー資金は消失していない。
- ユーザーの Vault share NAV には idle 資産も含まれている。
- ユーザーが出金する場合、持分割合に応じて LP 由来資産と idle 資産が返る。
- ただし、idle 資産は LP 手数料を獲得しないため、実現収益は本来想定より低下する。
- daily rewards / Cashdrop cron は「LP が稼いだ手数料の回収・配布」であり、Vault 本体に残った idle 資産を自動投入する処理ではない。

## 原因

`depositUSDC()` は入金 USDC を受け取り、`_deployToAdapter(0, amount)` を呼ぶ。

`_deployToAdapter()` は以下の流れで処理する。

1. `_balanceSingleSidedDeposit()` で単一 USDC 入金の約半分を KHYPE にスワップする。
2. USDC / KHYPE を Adapter に送る。
3. Adapter の `deposit(amount0, amount1)` で Project X NPM ポジションに投入する。
4. Adapter に残った idle token を `adapter.forwardIdleToVault()` で Vault に戻す。

集中流動性 LP では、現在価格・レンジ・token 順序によって、ポジションが受け入れられる token 比率が変わる。現在の実装は「単純に半分を KHYPE にする」方式のため、LP が必要とする比率とズレると片側 token が使い切れない。

今回、使い切れなかった KHYPE が Adapter から Vault に戻された。戻された資産は NAV に含まれるが、Vault には「戻った idle USDC / KHYPE を後から再投入する外部関数」がない。

## 今のコントラクトでできること / できないこと

できること:

- `withdraw()` により、各ユーザーが自分の shares を焼却して持分相当の USDC / KHYPE を受け取る。
- `harvestFees()` により、LP が獲得した手数料を回収して fee split / Cashdrop に回す。
- `rebalance()` により、Adapter が保有する既存 LP ポジションを再センターする。

できないこと:

- Keeper / owner が Vault 本体の idle USDC / KHYPE を Adapter に送って再投入する。
- Owner が Vault 本体の USDC / KHYPE を `recoverForeignToken()` で回収する。
  - `recoverForeignToken()` は underlying assets である USDC / WHYPE を明示的に拒否する。
- Owner がユーザーの Vault shares を代理で burn / transfer して移行する。
- Adapter / Vault implementation を upgrade する。
  - Vault の `adapter`, `tokenWHYPE`, `tokenUSDC`, `merkleAirdrop` は immutable。
  - Proxy / upgrade mechanism はない。

## ユーザー手間なし移行の再確認

結論: 現 Vault の既存ユーザー資産を、ユーザー署名なしで新 Vault へ完全移行するオンチェーン経路は確認できない。

理由:

1. 既存 Vault は upgradeable ではない。
2. Vault 本体が保有する USDC / KHYPE を owner が任意移動する関数はない。
3. `recoverForeignToken()` は USDC / WHYPE を移動できない。
4. `withdraw()` は `msg.sender` の shares のみを burn できる。
5. ERC20 share token に `permit` や operator migration 権限はない。
6. Adapter の `recoverToken()` は Adapter 保有 token にしか効かず、今回の idle は Vault 本体にある。

したがって、「運営だけのトランザクションで、既存ユーザーの資金を新 Vault に移し、旧 Vault を空にする」ことはできない。

ただし、ユーザー体験上の手間を減らす案はある。

### 案 A: 旧 Vault を既存ユーザー専用として維持し、新規入金だけ修正版 Vault に切替

- ユーザー操作なし。
- 旧 Vault の既存ユーザー資産はそのまま表示・出金可能にする。
- 新規入金は修正版 Vault へ向ける。
- 旧 Vault の LP 部分は収益を継続するが、旧 Vault の idle 部分は稼がない。
- フロントは旧 Vault / 新 Vault の残高・履歴を合算表示する必要がある。

### 案 B: ユーザーにワンクリック移行を依頼する

- ユーザーは `withdraw()` して新 Vault に `deposit` する。
- もっとも透明で安全。
- ただしユーザー操作とガスが必要。
- アプリ側で「移行」ボタンとしてまとめる場合でも、少なくとも署名 / トランザクション承認は必要。

### 案 C: 旧 Vault share を受け取る移行用コントラクトを用意する

- 新コントラクトが旧 share を預かり、ユーザーに新 share を発行する設計は可能。
- ただし旧 Vault から underlying を取り出すには、最終的に旧 share の transfer / approve / withdraw が必要。
- ユーザー署名なしでは実行できない。

### 案 D: 旧 Vault のまま運用継続

- ユーザー操作なし。
- 資金は維持され、LP 投入済み部分は稼ぎ続ける。
- idle 部分の収益効率低下は残る。
- 新規入金を続けると、同じ問題が拡大する可能性があるため推奨しない。

## 推奨対応

1. 旧 Vault への新規入金を止める、またはフロントで新規入金先を修正版 Vault に切り替える。
2. 修正版 Vault には以下を追加する。
   - keeper / owner callable の `deployIdle()` または同等関数。
   - Vault 本体の idle USDC / KHYPE を Adapter に送って LP に投入する処理。
   - 集中流動性レンジに合わせた片側入金バランス調整、または投入後 idle が閾値を超えたら revert / retry する安全策。
3. 既存ユーザーについては、旧 Vault と新 Vault の残高をフロントで合算表示し、任意のワンクリック移行導線を用意する。
4. ユーザー告知では「資金は安全・出金可能。ただし一部が待機状態で収益効率が落ちている」と正確に伝える。

## 暫定運用判断

2026-07-05 22:17 JST 時点では、ユーザーに追加移行フローを踏ませるより、いったん希望ユーザーに出金してもらう方針が安全寄り。

2026-07-05 22:24 JST 時点で、暫定対応は「ユーザー本人に出金してもらう」方針とする。運営側だけでユーザー資金を返金することは、現 Vault ではできない。

2026-07-06 14:07 JST 時点で、他ユーザーの出金が進んだことを確認。運営系ウォレット `0x0196f2949FbcE973d54d2047E3B8bfAde06e8ceC` と作業用ウォレット `0x9F65bC1df503209F7632875087c41D59d9C733D0` の Vault share は `0`。現 Vault に残っている確認済み holder は `0xF35208BfAdc5f7d38334FD71f42FdDC7eeB85b55` のみ。

注意点:

- `pause()` は `depositUSDC()` / `depositHYPE()` だけでなく `withdraw()` も止めるため、出金案内中に Vault を pause しない。
- 新規入金停止はコントラクト pause ではなく、まずフロント側で入金 UI を停止 / 注意表示する。
- ユーザーには「資金は Vault の NAV に含まれており、出金可能。ただし一部 idle のため収益効率が落ちている」と説明する。
- 出金後に再入金してもらう場合は、修正版 Vault を用意してから案内する。

## 次期 Vault の emergency refund 方針

次期 Vault では、一斉返金用の emergency function を検討候補としたが、2026-07-06 時点ではいったん保留する。ただし、将来導入する場合でも owner が任意の宛先・任意の金額を送れる設計は危険であり採用しない。

安全寄りの設計:

- emergency mode 中のみ実行可能。
- deposit / rebalance / harvest は止めるが、withdraw / refund は可能にする。
- `emergencyRefund(address[] holders)` のようにバッチ実行できる。
- 返金先は必ず share 保有者本人 (`holder`) に固定する。
- 返金額はその時点の share 残高に対する pro-rata でコントラクトが計算する。
- 実行時に対象 holder の shares を burn する。
- owner / keeper が金額や受取先を任意指定できない。
- multisig / timelock / event logging を必須にする。
- holder 数が増えても実行できるよう、pagination 形式にする。

この設計なら「運営が資金を盗める権限」ではなく、「緊急時にユーザー本人のアドレスへ強制出金する権限」として扱える。完全にリスクゼロではないが、任意 sweep 権限より大幅に安全。

## 追加確認事項

- 旧 Vault で `rebalance()` を実行しても Vault 本体の idle KHYPE は Adapter に送られないため、この問題の直接解消にはならない。
- 次回 deposit があっても、Vault 本体の既存 idle KHYPE を自動投入する処理は呼ばれない。
- daily rewards cron は idle 資産の再投入処理ではない。

## 2026-07-06 解消 — 第5世代 Vault へ移行

| 項目 | 値 |
|---|---|
| 新 Vault | `0x5D6ee5B7DCCC30c227B4375c77f31fa12aD5874e` |
| 新 Adapter | `0x432A72d0894C1B6d967A90abdBef19e9E326e41e` |
| 旧 Vault（paused） | `0x03cF822d0192D687cBDc2fAe6B8492a27634aD99` |
| 旧 Vault pause tx | `0xc0444bf2c99955bd93fcdcc99cfd8bc3e647221b14c48dc71fde339328978234` |

全ユーザー出金完了後、セキュリティ修正 + `deployIdle()` を含む第5世代 Vault/Adapter をデプロイ。Cashdrop 状態はリセット（`vaultShareHolders` / `airdropEntries` 空）。


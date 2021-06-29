[![CircleCI](https://circleci.com/annexfinance/annex-protocol/annex-protocol.svg?style=svg&circle-token=5ed19932325c559a06f71f87d69012aedd2cf3fb)](https://circleci.com/gh/annexfinance/annex-protocol) [![codecov](https://codecov.io/gh/annexfinance/annex-protocol/branch/master/graph/badge.svg?token=q4UvsvVzOX)](https://codecov.io/gh/annexfinance/annex-protocol)

Annex Protocol
=================

The Annex Protocol is an Binance Smart Chain smart contract for supplying or borrowing assets. Through the aToken contracts, accounts on the blockchain *supply* capital (BNB or BEP-20 tokens) to receive aTokens or *borrow* assets from the protocol (holding other assets as collateral). The Annex aToken contracts track these balances and algorithmically set interest rates for borrowers.

Before getting started with this repo, please read:

Contracts
=========

We detail a few of the core contracts in the Annex protocol.

<dl>
  <dt>AToken, ABep20 and ABNB</dt>
  <dd>The Annex aTokens, which are self-contained borrowing and lending contracts. AToken contains the core logic and ABep20, ABUSD and ABNB add public interfaces for Bep20 tokens and bnb, respectively. Each AToken is assigned an interest rate and risk model (see InterestRateModel and Comptroller sections), and allows accounts to *mint* (supply capital), *redeem* (withdraw capital), *borrow* and *repay a borrow*. Each AToken is an BEP-20 compliant token where balances represent ownership of the market.</dd>
</dl>

<dl>
  <dt>Comptroller</dt>
  <dd>The risk model contract, which validates permissible user actions and disallows actions if they do not fit certain risk parameters. For instance, the Comptroller enforces that each borrowing user must maintain a sufficient collateral balance across all aTokens.</dd>
</dl>

<dl>
  <dt>ANN</dt>
  <dd>The Annex Governance Token (ANN). Holders of this token have the ability to govern the protocol via the governor contract.</dd>
</dl>

<dl>
  <dt>Governor Alpha</dt>
  <dd>The administrator of the Annex timelock contract. Holders of ANN token may create and vote on proposals which will be queued into the Annex timelock and then have effects on Annex aToken and Comptroller contracts. This contract may be replaced in the future with a beta version.</dd>
</dl>

<dl>
  <dt>InterestRateModel</dt>
  <dd>Contracts which define interest rate models. These models algorithmically determine interest rates based on the current utilization of a given market (that is, how much of the supplied assets are liquid versus borrowed).</dd>
</dl>

<dl>
  <dt>Careful Math</dt>
  <dd>Library for safe math operations.</dd>
</dl>

<dl>
  <dt>ErrorReporter</dt>
  <dd>Library for tracking error codes and failure conditions.</dd>
</dl>

<dl>
  <dt>Exponential</dt>
  <dd>Library for handling fixed-point decimal numbers.</dd>
</dl>

<dl>
  <dt>SafeToken</dt>
  <dd>Library for safely handling Bep20 interaction.</dd>
</dl>

<dl>
  <dt>WhitePaperInterestRateModel</dt>
  <dd>Initial interest rate model, as defined in the Whitepaper. This contract accepts a base rate and slope parameter in its constructor.</dd>
</dl>

Installation
------------
To run annex, pull the repository from GitHub and install its dependencies. You will need [yarn](https://yarnpkg.com/lang/en/docs/install/) or [npm](https://docs.npmjs.com/cli/install) installed.

    git clone https://github.com/annexfinance/annex-protocol
    cd annex-protocol
    yarn install --lock-file # or `npm install`

REPL
----

The Annex Protocol has a simple scenario evaluation tool to test and evaluate scenarios which could occur on the blockchain. This is primarily used for constructing high-level integration tests. The tool also has a REPL to interact with local the Annex Protocol (similar to `truffle console`).

    yarn repl -n development
    yarn repl -n rinkeby

    > Read AToken aBAT Address
    Command: Read AToken aBAT Address
    AddressV<val=0xAD53863b864AE703D31b819d29c14cDA93D7c6a6>

You can read more about the scenario runner in the [Scenario Docs](https://github.com/annexfinance/annex-protocol/tree/master/scenario/SCENARIO.md) on steps for using the repl.

Testing
-------
Jest contract tests are defined under the [tests directory](https://github.com/annexfinance/annex-protocol/tree/master/tests). To run the tests run:

    yarn test

Integration Specs
-----------------

There are additional tests under the [spec/scenario](https://github.com/annexfinance/annex-protocol/tree/master/spec/scenario) folder. These are high-level integration tests based on the scenario runner depicted above. The aim of these tests is to be highly literate and have high coverage in the interaction of contracts.

Formal Verification Specs
-------------------------

The Annex Protocol has a number of formal verification specifications, powered by [Certik](https://certik.foundation/projects/annex). The Certik Verification evaluates smart contracts for vulnerabilities and certifies their behavior with respect to a custom function specification.
=======
See the [Scenario Docs](https://github.com/annexfinance/annex-protocol/tree/master/scenario/SCENARIO.md) on steps for using the repl.

Testing
-------
Contract tests are defined under the [tests directory](https://github.com/annexfinance/annex-protocol/tree/master/tests). To run the tests run:

    yarn test

Code Coverage
-------------
To run code coverage, run:

    yarn coverage

Linting
-------
To lint the code, run:

    yarn lint

Docker
------

To run in docker:

    # Build the docker image
    docker build -t annexfinance/annex-protocol .

    # Run a shell to the built image
    docker run -it annexfinance/annex-protocol /bin/sh

From within a docker shell, you can interact locally with the protocol via ganache and truffle:

```bash
    /annex-protocol > yarn console -n goerli
    Using network goerli https://goerli-eth.annex.io
    Saddle console on network goerli https://goerli-eth.annex.io
    Deployed goerli contracts
      comptroller: 0x627EA49279FD0dE89186A58b8758aD02B6Be2867
      ann: 0xfa5E1B628EFB17C024ca76f65B45Faf6B3128CA5
      governorAlpha: 0x8C3969Dd514B559D78135e9C210F2F773Feadf21
      maximillion: 0x73d3F01b8aC5063f4601C7C45DA5Fdf1b5240C92
      priceOracle: 0x9A536Ed5C97686988F93C9f7C2A390bF3B59c0ec
      priceOracleProxy: 0xd0c84453b3945cd7e84BF7fc53BfFd6718913B71
      timelock: 0x25e46957363e16C4e2D5F2854b062475F9f8d287
      unitroller: 0x627EA49279FD0dE89186A58b8758aD02B6Be2867

    > await ann.methods.totalSupply().call()
    '300000000000000000000000000'
```

Console
-------

After you deploy, as above, you can run a truffle console with the following command:

    yarn console -n goerli

This command will start a saddle console conencted to Goerli testnet (see [Saddle README](https://github.com/annexfinance/saddle#cli)):

```javascript
    Using network goerli https://goerli.infura.io/v3/e1a5d4d2c06a4e81945fca56d0d5d8ea
    Saddle console on network goerli https://goerli.infura.io/v3/e1a5d4d2c06a4e81945fca56d0d5d8ea
    Deployed goerli contracts
      comptroller: 0x627EA49279FD0dE89186A58b8758aD02B6Be2867
      ann: 0xfa5E1B628EFB17C024ca76f65B45Faf6B3128CA5
      governorAlpha: 0x8C3969Dd514B559D78135e9C210F2F773Feadf21
      maximillion: 0x73d3F01b8aC5063f4601C7C45DA5Fdf1b5240C92
      priceOracle: 0x9A536Ed5C97686988F93C9f7C2A390bF3B59c0ec
      priceOracleProxy: 0xd0c84453b3945cd7e84BF7fc53BfFd6718913B71
      timelock: 0x25e46957363e16C4e2D5F2854b062475F9f8d287
      unitroller: 0x627EA49279FD0dE89186A58b8758aD02B6Be2867

    > await ann.methods.totalSupply().call()
    '300000000000000000000000000'
```

Deploying a AToken from Source
------------------------------

Note: you will need to set `~/.ethereum/<network>` with your private key or assign your private key to the environment variable `ACCOUNT`.

Note: for all sections including BscScan verification, you must set the `BSCSCAN_API_KEY` to a valid API Key from [BscScan](https://bscscan.com/apis).

To deploy a new aToken, you can run the `token:deploy`. command, as follows. If you set `VERIFY=true`, the script will verify the token on BscScan as well. The JSON here is the token config JSON, which should be specific to the token you wish to list.

```bash
npx saddle -n rinkeby script token:deploy '{
  "underlying": "0x577D296678535e4903D59A4C929B718e1D575e0A",
  "comptroller": "$Comptroller",
  "interestRateModel": "$Base200bps_Slope3000bps",
  "initialExchangeRateMantissa": "2.0e18",
  "name": "Annex Kyber Network Crystal",
  "symbol": "vKNC",
  "decimals": "8",
  "admin": "$Timelock"
}'
```

If you only want to verify an existing token an BscScan, make sure `BSCSCAN_API_KEY` is set and run `token:verify` with the first argument as the token address and the second as the token config JSON:

```bash
npx saddle -n rinkeby script token:verify 0x19B674715cD20626415C738400FDd0d32D6809B6 '{
  "underlying": "0x577D296678535e4903D59A4C929B718e1D575e0A",
  "comptroller": "$Comptroller",
  "interestRateModel": "$Base200bps_Slope3000bps",
  "initialExchangeRateMantissa": "2.0e18",
  "name": "Annex Kyber Network Crystal",
  "symbol": "vKNC",
  "decimals": "8",
  "admin": "$Timelock"
}'
```

Finally, to see if a given deployment matches this version of the Annex Protocol, you can run `token:match` with a token address and token config:

```bash
npx saddle -n rinkeby script token:match 0x19B674715cD20626415C738400FDd0d32D6809B6 '{
  "underlying": "0x577D296678535e4903D59A4C929B718e1D575e0A",
  "comptroller": "$Comptroller",
  "interestRateModel": "$Base200bps_Slope3000bps",
  "initialExchangeRateMantissa": "2.0e18",
  "name": "Annex Kyber Network Crystal",
  "symbol": "aKNC",
  "decimals": "8",
  "admin": "$Timelock"
}'
```

## Deploying a AToken from Docker Build
---------------------------------------

To deploy a specific version of the Annex Protocol, you can use the `token:deploy` script through Docker:

```bash
docker run --env BSCSCAN_API_KEY --env VERIFY=true --env ACCOUNT=0x$(cat ~/.ethereum/rinkeby) annexfinance/annex-protocol:latest npx saddle -n rinkeby script token:deploy '{
  "underlying": "0x577D296678535e4903D59A4C929B718e1D575e0A",
  "comptroller": "$Comptroller",
  "interestRateModel": "$Base200bps_Slope3000bps",
  "initialExchangeRateMantissa": "2.0e18",
  "name": "Annex Kyber Network Crystal",
  "symbol": "aKNC",
  "decimals": "8",
  "admin": "$Timelock"
}'
```

To match a deployed contract against a given version of the Annex Protocol, you can run `token:match` through Docker, passing a token address and config:

```bash
docker run --env ACCOUNT=0x$(cat ~/.ethereum/rinkeby) annexfinance/annex-protocol:latest npx saddle -n rinkeby script token:match 0xF1BAd36CB247C82Cb4e9C2874374492Afb50d565 '{
  "underlying": "0x577D296678535e4903D59A4C929B718e1D575e0A",
  "comptroller": "$Comptroller",
  "interestRateModel": "$Base200bps_Slope3000bps",
  "initialExchangeRateMantissa": "2.0e18",
  "name": "Annex Kyber Network Crystal",
  "symbol": "aKNC",
  "decimals": "8",
  "admin": "$Timelock"
}'
```

Discussion
----------

For any concerns with the protocol, open an issue or visit us on [Telegram](https://t.me/annexprotocol) to discuss.

For security concerns, please email [security@annex.finance](mailto:security@annex.finance).

_© Copyright 2021, Annex Finance

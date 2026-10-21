import { P as concat$1, cl as pad$1, a0 as numberToHex, aB as size$2, Q as encodeAbiParameters, aC as keccak256, cm as getAction, cn as getCode, co as readContract, cp as parseAbi, H as BaseError$1, cq as prettyPrint, cr as formatGwei, K as decodeErrorResult, cs as ContractFunctionZeroDataError, ct as ContractFunctionRevertedError, cu as ContractFunctionExecutionError, cv as hexToBigInt, cw as AccountNotFoundError, cx as parseAccount, b2 as encodeFunctionData, cy as estimateFeesPerGas, cz as getChainId, cA as serializeStateOverride, cB as formatLog, cC as formatTransactionReceipt, J as stringify$1, cD as observe, cE as poll, cF as createClient, ck as sha256$1 } from "./appkit-DSMu6gPS.js";
import { a as hashTypedData } from "./hashTypedData-Bck5Rcba.js";
import { c as createNonceManager, s as serializeErc6492Signature, p as prepareAuthorization } from "./parseSignature-mj1PKMOX.js";
import { p as p256 } from "./index-Cahz09aN.js";
const entryPoint06Abi = [
  {
    inputs: [
      { name: "preOpGas", type: "uint256" },
      { name: "paid", type: "uint256" },
      { name: "validAfter", type: "uint48" },
      { name: "validUntil", type: "uint48" },
      { name: "targetSuccess", type: "bool" },
      { name: "targetResult", type: "bytes" }
    ],
    name: "ExecutionResult",
    type: "error"
  },
  {
    inputs: [
      { name: "opIndex", type: "uint256" },
      { name: "reason", type: "string" }
    ],
    name: "FailedOp",
    type: "error"
  },
  {
    inputs: [{ name: "sender", type: "address" }],
    name: "SenderAddressResult",
    type: "error"
  },
  {
    inputs: [{ name: "aggregator", type: "address" }],
    name: "SignatureValidationFailed",
    type: "error"
  },
  {
    inputs: [
      {
        components: [
          { name: "preOpGas", type: "uint256" },
          { name: "prefund", type: "uint256" },
          { name: "sigFailed", type: "bool" },
          { name: "validAfter", type: "uint48" },
          { name: "validUntil", type: "uint48" },
          { name: "paymasterContext", type: "bytes" }
        ],
        name: "returnInfo",
        type: "tuple"
      },
      {
        components: [
          { name: "stake", type: "uint256" },
          { name: "unstakeDelaySec", type: "uint256" }
        ],
        name: "senderInfo",
        type: "tuple"
      },
      {
        components: [
          { name: "stake", type: "uint256" },
          { name: "unstakeDelaySec", type: "uint256" }
        ],
        name: "factoryInfo",
        type: "tuple"
      },
      {
        components: [
          { name: "stake", type: "uint256" },
          { name: "unstakeDelaySec", type: "uint256" }
        ],
        name: "paymasterInfo",
        type: "tuple"
      }
    ],
    name: "ValidationResult",
    type: "error"
  },
  {
    inputs: [
      {
        components: [
          { name: "preOpGas", type: "uint256" },
          { name: "prefund", type: "uint256" },
          { name: "sigFailed", type: "bool" },
          { name: "validAfter", type: "uint48" },
          { name: "validUntil", type: "uint48" },
          { name: "paymasterContext", type: "bytes" }
        ],
        name: "returnInfo",
        type: "tuple"
      },
      {
        components: [
          { name: "stake", type: "uint256" },
          { name: "unstakeDelaySec", type: "uint256" }
        ],
        name: "senderInfo",
        type: "tuple"
      },
      {
        components: [
          { name: "stake", type: "uint256" },
          { name: "unstakeDelaySec", type: "uint256" }
        ],
        name: "factoryInfo",
        type: "tuple"
      },
      {
        components: [
          { name: "stake", type: "uint256" },
          { name: "unstakeDelaySec", type: "uint256" }
        ],
        name: "paymasterInfo",
        type: "tuple"
      },
      {
        components: [
          { name: "aggregator", type: "address" },
          {
            components: [
              { name: "stake", type: "uint256" },
              {
                name: "unstakeDelaySec",
                type: "uint256"
              }
            ],
            name: "stakeInfo",
            type: "tuple"
          }
        ],
        name: "aggregatorInfo",
        type: "tuple"
      }
    ],
    name: "ValidationResultWithAggregation",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "userOpHash",
        type: "bytes32"
      },
      {
        indexed: true,
        name: "sender",
        type: "address"
      },
      {
        indexed: false,
        name: "factory",
        type: "address"
      },
      {
        indexed: false,
        name: "paymaster",
        type: "address"
      }
    ],
    name: "AccountDeployed",
    type: "event"
  },
  { anonymous: false, inputs: [], name: "BeforeExecution", type: "event" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address"
      },
      {
        indexed: false,
        name: "totalDeposit",
        type: "uint256"
      }
    ],
    name: "Deposited",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "aggregator",
        type: "address"
      }
    ],
    name: "SignatureAggregatorChanged",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address"
      },
      {
        indexed: false,
        name: "totalStaked",
        type: "uint256"
      },
      {
        indexed: false,
        name: "unstakeDelaySec",
        type: "uint256"
      }
    ],
    name: "StakeLocked",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address"
      },
      {
        indexed: false,
        name: "withdrawTime",
        type: "uint256"
      }
    ],
    name: "StakeUnlocked",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address"
      },
      {
        indexed: false,
        name: "withdrawAddress",
        type: "address"
      },
      {
        indexed: false,
        name: "amount",
        type: "uint256"
      }
    ],
    name: "StakeWithdrawn",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "userOpHash",
        type: "bytes32"
      },
      {
        indexed: true,
        name: "sender",
        type: "address"
      },
      {
        indexed: true,
        name: "paymaster",
        type: "address"
      },
      {
        indexed: false,
        name: "nonce",
        type: "uint256"
      },
      { indexed: false, name: "success", type: "bool" },
      {
        indexed: false,
        name: "actualGasCost",
        type: "uint256"
      },
      {
        indexed: false,
        name: "actualGasUsed",
        type: "uint256"
      }
    ],
    name: "UserOperationEvent",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "userOpHash",
        type: "bytes32"
      },
      {
        indexed: true,
        name: "sender",
        type: "address"
      },
      {
        indexed: false,
        name: "nonce",
        type: "uint256"
      },
      {
        indexed: false,
        name: "revertReason",
        type: "bytes"
      }
    ],
    name: "UserOperationRevertReason",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "account",
        type: "address"
      },
      {
        indexed: false,
        name: "withdrawAddress",
        type: "address"
      },
      {
        indexed: false,
        name: "amount",
        type: "uint256"
      }
    ],
    name: "Withdrawn",
    type: "event"
  },
  {
    inputs: [],
    name: "SIG_VALIDATION_FAILED",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "initCode", type: "bytes" },
      { name: "sender", type: "address" },
      { name: "paymasterAndData", type: "bytes" }
    ],
    name: "_validateSenderAndPaymaster",
    outputs: [],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "unstakeDelaySec", type: "uint32" }],
    name: "addStake",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "depositTo",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "deposits",
    outputs: [
      { name: "deposit", type: "uint112" },
      { name: "staked", type: "bool" },
      { name: "stake", type: "uint112" },
      { name: "unstakeDelaySec", type: "uint32" },
      { name: "withdrawTime", type: "uint48" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "getDepositInfo",
    outputs: [
      {
        components: [
          { name: "deposit", type: "uint112" },
          { name: "staked", type: "bool" },
          { name: "stake", type: "uint112" },
          { name: "unstakeDelaySec", type: "uint32" },
          { name: "withdrawTime", type: "uint48" }
        ],
        name: "info",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" }
    ],
    name: "getNonce",
    outputs: [{ name: "nonce", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "initCode", type: "bytes" }],
    name: "getSenderAddress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "callGasLimit", type: "uint256" },
          {
            name: "verificationGasLimit",
            type: "uint256"
          },
          {
            name: "preVerificationGas",
            type: "uint256"
          },
          { name: "maxFeePerGas", type: "uint256" },
          {
            name: "maxPriorityFeePerGas",
            type: "uint256"
          },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" }
        ],
        name: "userOp",
        type: "tuple"
      }
    ],
    name: "getUserOpHash",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { name: "sender", type: "address" },
              { name: "nonce", type: "uint256" },
              { name: "initCode", type: "bytes" },
              { name: "callData", type: "bytes" },
              {
                name: "callGasLimit",
                type: "uint256"
              },
              {
                name: "verificationGasLimit",
                type: "uint256"
              },
              {
                name: "preVerificationGas",
                type: "uint256"
              },
              {
                name: "maxFeePerGas",
                type: "uint256"
              },
              {
                name: "maxPriorityFeePerGas",
                type: "uint256"
              },
              {
                name: "paymasterAndData",
                type: "bytes"
              },
              { name: "signature", type: "bytes" }
            ],
            name: "userOps",
            type: "tuple[]"
          },
          {
            name: "aggregator",
            type: "address"
          },
          { name: "signature", type: "bytes" }
        ],
        name: "opsPerAggregator",
        type: "tuple[]"
      },
      { name: "beneficiary", type: "address" }
    ],
    name: "handleAggregatedOps",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "callGasLimit", type: "uint256" },
          {
            name: "verificationGasLimit",
            type: "uint256"
          },
          {
            name: "preVerificationGas",
            type: "uint256"
          },
          { name: "maxFeePerGas", type: "uint256" },
          {
            name: "maxPriorityFeePerGas",
            type: "uint256"
          },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" }
        ],
        name: "ops",
        type: "tuple[]"
      },
      { name: "beneficiary", type: "address" }
    ],
    name: "handleOps",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "key", type: "uint192" }],
    name: "incrementNonce",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "callData", type: "bytes" },
      {
        components: [
          {
            components: [
              { name: "sender", type: "address" },
              { name: "nonce", type: "uint256" },
              {
                name: "callGasLimit",
                type: "uint256"
              },
              {
                name: "verificationGasLimit",
                type: "uint256"
              },
              {
                name: "preVerificationGas",
                type: "uint256"
              },
              { name: "paymaster", type: "address" },
              {
                name: "maxFeePerGas",
                type: "uint256"
              },
              {
                name: "maxPriorityFeePerGas",
                type: "uint256"
              }
            ],
            name: "mUserOp",
            type: "tuple"
          },
          { name: "userOpHash", type: "bytes32" },
          { name: "prefund", type: "uint256" },
          { name: "contextOffset", type: "uint256" },
          { name: "preOpGas", type: "uint256" }
        ],
        name: "opInfo",
        type: "tuple"
      },
      { name: "context", type: "bytes" }
    ],
    name: "innerHandleOp",
    outputs: [{ name: "actualGasCost", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "uint192" }
    ],
    name: "nonceSequenceNumber",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "callGasLimit", type: "uint256" },
          {
            name: "verificationGasLimit",
            type: "uint256"
          },
          {
            name: "preVerificationGas",
            type: "uint256"
          },
          { name: "maxFeePerGas", type: "uint256" },
          {
            name: "maxPriorityFeePerGas",
            type: "uint256"
          },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" }
        ],
        name: "op",
        type: "tuple"
      },
      { name: "target", type: "address" },
      { name: "targetCallData", type: "bytes" }
    ],
    name: "simulateHandleOp",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "callGasLimit", type: "uint256" },
          {
            name: "verificationGasLimit",
            type: "uint256"
          },
          {
            name: "preVerificationGas",
            type: "uint256"
          },
          { name: "maxFeePerGas", type: "uint256" },
          {
            name: "maxPriorityFeePerGas",
            type: "uint256"
          },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" }
        ],
        name: "userOp",
        type: "tuple"
      }
    ],
    name: "simulateValidation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "unlockStake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        name: "withdrawAddress",
        type: "address"
      }
    ],
    name: "withdrawStake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        name: "withdrawAddress",
        type: "address"
      },
      { name: "withdrawAmount", type: "uint256" }
    ],
    name: "withdrawTo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  { stateMutability: "payable", type: "receive" }
];
const entryPoint06Address = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
function getInitCode(userOperation, options = {}) {
  const { forHash } = options;
  const { authorization, factory, factoryData } = userOperation;
  if (forHash && (factory === "0x7702" || factory === "0x7702000000000000000000000000000000000000")) {
    if (!authorization)
      return "0x7702000000000000000000000000000000000000";
    return concat$1([authorization.address, factoryData ?? "0x"]);
  }
  if (!factory)
    return "0x";
  return concat$1([factory, factoryData ?? "0x"]);
}
const paymasterSignatureMagic = "0x22e325a297439656";
function toPackedUserOperation(userOperation, options = {}) {
  const { callGasLimit, callData, maxPriorityFeePerGas, maxFeePerGas, paymaster, paymasterData, paymasterPostOpGasLimit, paymasterSignature, paymasterVerificationGasLimit, sender, signature = "0x", verificationGasLimit } = userOperation;
  const accountGasLimits = concat$1([
    pad$1(numberToHex(verificationGasLimit || 0n), { size: 16 }),
    pad$1(numberToHex(callGasLimit || 0n), { size: 16 })
  ]);
  const initCode = getInitCode(userOperation, options);
  const gasFees = concat$1([
    pad$1(numberToHex(maxPriorityFeePerGas || 0n), { size: 16 }),
    pad$1(numberToHex(maxFeePerGas || 0n), { size: 16 })
  ]);
  const nonce = userOperation.nonce ?? 0n;
  const paymasterAndData = paymaster ? concat$1([
    paymaster,
    pad$1(numberToHex(paymasterVerificationGasLimit || 0n), {
      size: 16
    }),
    pad$1(numberToHex(paymasterPostOpGasLimit || 0n), {
      size: 16
    }),
    paymasterData || "0x",
    ...paymasterSignature ? options.forHash ? [paymasterSignatureMagic] : [
      paymasterSignature,
      pad$1(numberToHex(size$2(paymasterSignature)), { size: 2 }),
      paymasterSignatureMagic
    ] : []
  ]) : "0x";
  const preVerificationGas = userOperation.preVerificationGas ?? 0n;
  return {
    accountGasLimits,
    callData,
    initCode,
    gasFees,
    nonce,
    paymasterAndData,
    preVerificationGas,
    sender,
    signature
  };
}
const types = {
  PackedUserOperation: [
    { type: "address", name: "sender" },
    { type: "uint256", name: "nonce" },
    { type: "bytes", name: "initCode" },
    { type: "bytes", name: "callData" },
    { type: "bytes32", name: "accountGasLimits" },
    { type: "uint256", name: "preVerificationGas" },
    { type: "bytes32", name: "gasFees" },
    { type: "bytes", name: "paymasterAndData" }
  ]
};
function getUserOperationTypedData(parameters) {
  const { chainId, entryPointAddress, userOperation } = parameters;
  const packedUserOp = toPackedUserOperation(userOperation, { forHash: true });
  return {
    types,
    primaryType: "PackedUserOperation",
    domain: {
      name: "ERC4337",
      version: "1",
      chainId,
      verifyingContract: entryPointAddress
    },
    message: packedUserOp
  };
}
function getUserOperationHash(parameters) {
  const { chainId, entryPointAddress, entryPointVersion } = parameters;
  const userOperation = parameters.userOperation;
  const { authorization, callData = "0x", callGasLimit, maxFeePerGas, maxPriorityFeePerGas, nonce, paymasterAndData = "0x", preVerificationGas, sender, verificationGasLimit } = userOperation;
  if (entryPointVersion === "0.8" || entryPointVersion === "0.9")
    return hashTypedData(getUserOperationTypedData({
      chainId,
      entryPointAddress,
      userOperation
    }));
  const packedUserOp = (() => {
    var _a, _b;
    if (entryPointVersion === "0.6") {
      const factory = (_a = userOperation.initCode) == null ? void 0 : _a.slice(0, 42);
      const factoryData = (_b = userOperation.initCode) == null ? void 0 : _b.slice(42);
      const initCode = getInitCode({
        authorization,
        factory,
        factoryData
      }, { forHash: true });
      return encodeAbiParameters([
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" }
      ], [
        sender,
        nonce,
        keccak256(initCode),
        keccak256(callData),
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
        keccak256(paymasterAndData)
      ]);
    }
    if (entryPointVersion === "0.7") {
      const packedUserOp2 = toPackedUserOperation(userOperation, {
        forHash: true
      });
      return encodeAbiParameters([
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" }
      ], [
        packedUserOp2.sender,
        packedUserOp2.nonce,
        keccak256(packedUserOp2.initCode),
        keccak256(packedUserOp2.callData),
        packedUserOp2.accountGasLimits,
        packedUserOp2.preVerificationGas,
        packedUserOp2.gasFees,
        keccak256(packedUserOp2.paymasterAndData)
      ]);
    }
    throw new Error(`entryPointVersion "${entryPointVersion}" not supported.`);
  })();
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint256" }], [keccak256(packedUserOp), entryPointAddress, BigInt(chainId)]));
}
async function toSmartAccount(implementation) {
  const { extend, nonceKeyManager = createNonceManager({
    source: {
      get() {
        return Date.now();
      },
      set() {
      }
    }
  }), ...rest } = implementation;
  let deployed = false;
  const address = await implementation.getAddress();
  return {
    ...extend,
    ...rest,
    address,
    async getFactoryArgs() {
      if ("isDeployed" in this && await this.isDeployed())
        return { factory: void 0, factoryData: void 0 };
      return implementation.getFactoryArgs();
    },
    async getNonce(parameters) {
      const key = (parameters == null ? void 0 : parameters.key) ?? BigInt(await nonceKeyManager.consume({
        address,
        chainId: implementation.client.chain.id,
        client: implementation.client
      }));
      if (implementation.getNonce)
        return await implementation.getNonce({ ...parameters, key });
      const nonce = await readContract(implementation.client, {
        abi: parseAbi([
          "function getNonce(address, uint192) pure returns (uint256)"
        ]),
        address: implementation.entryPoint.address,
        functionName: "getNonce",
        args: [address, key]
      });
      return nonce;
    },
    async isDeployed() {
      if (deployed)
        return true;
      const code = await getAction(implementation.client, getCode, "getCode")({
        address
      });
      deployed = Boolean(code);
      return deployed;
    },
    ...implementation.sign ? {
      async sign(parameters) {
        const [{ factory, factoryData }, signature] = await Promise.all([
          this.getFactoryArgs(),
          implementation.sign(parameters)
        ]);
        if (factory && factoryData)
          return serializeErc6492Signature({
            address: factory,
            data: factoryData,
            signature
          });
        return signature;
      }
    } : {},
    async signMessage(parameters) {
      const [{ factory, factoryData }, signature] = await Promise.all([
        this.getFactoryArgs(),
        implementation.signMessage(parameters)
      ]);
      if (factory && factoryData && factory !== "0x7702")
        return serializeErc6492Signature({
          address: factory,
          data: factoryData,
          signature
        });
      return signature;
    },
    async signTypedData(parameters) {
      const [{ factory, factoryData }, signature] = await Promise.all([
        this.getFactoryArgs(),
        implementation.signTypedData(parameters)
      ]);
      if (factory && factoryData && factory !== "0x7702")
        return serializeErc6492Signature({
          address: factory,
          data: factoryData,
          signature
        });
      return signature;
    },
    type: "smart"
  };
}
class AccountNotDeployedError extends BaseError$1 {
  constructor({ cause }) {
    super("Smart Account is not deployed.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- No `factory`/`factoryData` or `initCode` properties are provided for Smart Account deployment.",
        "- An incorrect `sender` address is provided."
      ],
      name: "AccountNotDeployedError"
    });
  }
}
Object.defineProperty(AccountNotDeployedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa20/
});
class ExecutionRevertedError extends BaseError$1 {
  constructor({ cause, data, message } = {}) {
    var _a;
    const reason = (_a = message == null ? void 0 : message.replace("execution reverted: ", "")) == null ? void 0 : _a.replace("execution reverted", "");
    super(`Execution reverted ${reason ? `with reason: ${reason}` : "for an unknown reason"}.`, {
      cause,
      name: "ExecutionRevertedError"
    });
    Object.defineProperty(this, "data", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.data = data;
  }
}
Object.defineProperty(ExecutionRevertedError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32521
});
Object.defineProperty(ExecutionRevertedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /execution reverted/
});
class FailedToSendToBeneficiaryError extends BaseError$1 {
  constructor({ cause }) {
    super("Failed to send funds to beneficiary.", {
      cause,
      name: "FailedToSendToBeneficiaryError"
    });
  }
}
Object.defineProperty(FailedToSendToBeneficiaryError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa91/
});
class GasValuesOverflowError extends BaseError$1 {
  constructor({ cause }) {
    super("Gas value overflowed.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- one of the gas values exceeded 2**120 (uint120)"
      ].filter(Boolean),
      name: "GasValuesOverflowError"
    });
  }
}
Object.defineProperty(GasValuesOverflowError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa94/
});
class HandleOpsOutOfGasError extends BaseError$1 {
  constructor({ cause }) {
    super("The `handleOps` function was called by the Bundler with a gas limit too low.", {
      cause,
      name: "HandleOpsOutOfGasError"
    });
  }
}
Object.defineProperty(HandleOpsOutOfGasError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa95/
});
class InitCodeFailedError extends BaseError$1 {
  constructor({ cause, factory, factoryData, initCode }) {
    super("Failed to simulate deployment for Smart Account.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- Invalid `factory`/`factoryData` or `initCode` properties are present",
        "- Smart Account deployment execution ran out of gas (low `verificationGasLimit` value)",
        "- Smart Account deployment execution reverted with an error\n",
        factory && `factory: ${factory}`,
        factoryData && `factoryData: ${factoryData}`,
        initCode && `initCode: ${initCode}`
      ].filter(Boolean),
      name: "InitCodeFailedError"
    });
  }
}
Object.defineProperty(InitCodeFailedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa13/
});
class InitCodeMustCreateSenderError extends BaseError$1 {
  constructor({ cause, factory, factoryData, initCode }) {
    super("Smart Account initialization implementation did not create an account.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- `factory`/`factoryData` or `initCode` properties are invalid",
        "- Smart Account initialization implementation is incorrect\n",
        factory && `factory: ${factory}`,
        factoryData && `factoryData: ${factoryData}`,
        initCode && `initCode: ${initCode}`
      ].filter(Boolean),
      name: "InitCodeMustCreateSenderError"
    });
  }
}
Object.defineProperty(InitCodeMustCreateSenderError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa15/
});
class InitCodeMustReturnSenderError extends BaseError$1 {
  constructor({ cause, factory, factoryData, initCode, sender }) {
    super("Smart Account initialization implementation does not return the expected sender.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "Smart Account initialization implementation does not return a sender address\n",
        factory && `factory: ${factory}`,
        factoryData && `factoryData: ${factoryData}`,
        initCode && `initCode: ${initCode}`,
        sender && `sender: ${sender}`
      ].filter(Boolean),
      name: "InitCodeMustReturnSenderError"
    });
  }
}
Object.defineProperty(InitCodeMustReturnSenderError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa14/
});
class InsufficientPrefundError extends BaseError$1 {
  constructor({ cause }) {
    super("Smart Account does not have sufficient funds to execute the User Operation.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the Smart Account does not have sufficient funds to cover the required prefund, or",
        "- a Paymaster was not provided"
      ].filter(Boolean),
      name: "InsufficientPrefundError"
    });
  }
}
Object.defineProperty(InsufficientPrefundError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa21/
});
class InternalCallOnlyError extends BaseError$1 {
  constructor({ cause }) {
    super("Bundler attempted to call an invalid function on the EntryPoint.", {
      cause,
      name: "InternalCallOnlyError"
    });
  }
}
Object.defineProperty(InternalCallOnlyError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa92/
});
class InvalidAggregatorError extends BaseError$1 {
  constructor({ cause }) {
    super("Bundler used an invalid aggregator for handling aggregated User Operations.", {
      cause,
      name: "InvalidAggregatorError"
    });
  }
}
Object.defineProperty(InvalidAggregatorError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa96/
});
class InvalidAccountNonceError extends BaseError$1 {
  constructor({ cause, nonce }) {
    super("Invalid Smart Account nonce used for User Operation.", {
      cause,
      metaMessages: [nonce && `nonce: ${nonce}`].filter(Boolean),
      name: "InvalidAccountNonceError"
    });
  }
}
Object.defineProperty(InvalidAccountNonceError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa25/
});
class InvalidBeneficiaryError extends BaseError$1 {
  constructor({ cause }) {
    super("Bundler has not set a beneficiary address.", {
      cause,
      name: "InvalidBeneficiaryError"
    });
  }
}
Object.defineProperty(InvalidBeneficiaryError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa90/
});
class InvalidFieldsError extends BaseError$1 {
  constructor({ cause }) {
    super("Invalid fields set on User Operation.", {
      cause,
      name: "InvalidFieldsError"
    });
  }
}
Object.defineProperty(InvalidFieldsError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32602
});
class InvalidPaymasterAndDataError extends BaseError$1 {
  constructor({ cause, paymasterAndData }) {
    super("Paymaster properties provided are invalid.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the `paymasterAndData` property is of an incorrect length\n",
        paymasterAndData && `paymasterAndData: ${paymasterAndData}`
      ].filter(Boolean),
      name: "InvalidPaymasterAndDataError"
    });
  }
}
Object.defineProperty(InvalidPaymasterAndDataError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa93/
});
class PaymasterDepositTooLowError extends BaseError$1 {
  constructor({ cause }) {
    super("Paymaster deposit for the User Operation is too low.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the Paymaster has deposited less than the expected amount via the `deposit` function"
      ].filter(Boolean),
      name: "PaymasterDepositTooLowError"
    });
  }
}
Object.defineProperty(PaymasterDepositTooLowError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32508
});
Object.defineProperty(PaymasterDepositTooLowError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa31/
});
class PaymasterFunctionRevertedError extends BaseError$1 {
  constructor({ cause }) {
    super("The `validatePaymasterUserOp` function on the Paymaster reverted.", {
      cause,
      name: "PaymasterFunctionRevertedError"
    });
  }
}
Object.defineProperty(PaymasterFunctionRevertedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa33/
});
class PaymasterNotDeployedError extends BaseError$1 {
  constructor({ cause }) {
    super("The Paymaster contract has not been deployed.", {
      cause,
      name: "PaymasterNotDeployedError"
    });
  }
}
Object.defineProperty(PaymasterNotDeployedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa30/
});
class PaymasterRateLimitError extends BaseError$1 {
  constructor({ cause }) {
    super("UserOperation rejected because paymaster (or signature aggregator) is throttled/banned.", {
      cause,
      name: "PaymasterRateLimitError"
    });
  }
}
Object.defineProperty(PaymasterRateLimitError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32504
});
class PaymasterStakeTooLowError extends BaseError$1 {
  constructor({ cause }) {
    super("UserOperation rejected because paymaster (or signature aggregator) stake or unstake-delay is too low.", {
      cause,
      name: "PaymasterStakeTooLowError"
    });
  }
}
Object.defineProperty(PaymasterStakeTooLowError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32505
});
class PaymasterPostOpFunctionRevertedError extends BaseError$1 {
  constructor({ cause }) {
    super("Paymaster `postOp` function reverted.", {
      cause,
      name: "PaymasterPostOpFunctionRevertedError"
    });
  }
}
Object.defineProperty(PaymasterPostOpFunctionRevertedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa50/
});
class SenderAlreadyConstructedError extends BaseError$1 {
  constructor({ cause, factory, factoryData, initCode }) {
    super("Smart Account has already been deployed.", {
      cause,
      metaMessages: [
        "Remove the following properties and try again:",
        factory && "`factory`",
        factoryData && "`factoryData`",
        initCode && "`initCode`"
      ].filter(Boolean),
      name: "SenderAlreadyConstructedError"
    });
  }
}
Object.defineProperty(SenderAlreadyConstructedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa10/
});
class SignatureCheckFailedError extends BaseError$1 {
  constructor({ cause }) {
    super("UserOperation rejected because account signature check failed (or paymaster signature, if the paymaster uses its data as signature).", {
      cause,
      name: "SignatureCheckFailedError"
    });
  }
}
Object.defineProperty(SignatureCheckFailedError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32507
});
class SmartAccountFunctionRevertedError extends BaseError$1 {
  constructor({ cause }) {
    super("The `validateUserOp` function on the Smart Account reverted.", {
      cause,
      name: "SmartAccountFunctionRevertedError"
    });
  }
}
Object.defineProperty(SmartAccountFunctionRevertedError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa23/
});
class UnsupportedSignatureAggregatorError extends BaseError$1 {
  constructor({ cause }) {
    super("UserOperation rejected because account specified unsupported signature aggregator.", {
      cause,
      name: "UnsupportedSignatureAggregatorError"
    });
  }
}
Object.defineProperty(UnsupportedSignatureAggregatorError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32506
});
class UserOperationExpiredError extends BaseError$1 {
  constructor({ cause }) {
    super("User Operation expired.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the `validAfter` or `validUntil` values returned from `validateUserOp` on the Smart Account are not satisfied"
      ].filter(Boolean),
      name: "UserOperationExpiredError"
    });
  }
}
Object.defineProperty(UserOperationExpiredError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa22/
});
class UserOperationPaymasterExpiredError extends BaseError$1 {
  constructor({ cause }) {
    super("Paymaster for User Operation expired.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the `validAfter` or `validUntil` values returned from `validatePaymasterUserOp` on the Paymaster are not satisfied"
      ].filter(Boolean),
      name: "UserOperationPaymasterExpiredError"
    });
  }
}
Object.defineProperty(UserOperationPaymasterExpiredError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa32/
});
class UserOperationSignatureError extends BaseError$1 {
  constructor({ cause }) {
    super("Signature provided for the User Operation is invalid.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the `signature` for the User Operation is incorrectly computed, and unable to be verified by the Smart Account"
      ].filter(Boolean),
      name: "UserOperationSignatureError"
    });
  }
}
Object.defineProperty(UserOperationSignatureError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa24/
});
class UserOperationPaymasterSignatureError extends BaseError$1 {
  constructor({ cause }) {
    super("Signature provided for the User Operation is invalid.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the `signature` for the User Operation is incorrectly computed, and unable to be verified by the Paymaster"
      ].filter(Boolean),
      name: "UserOperationPaymasterSignatureError"
    });
  }
}
Object.defineProperty(UserOperationPaymasterSignatureError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa34/
});
class UserOperationRejectedByEntryPointError extends BaseError$1 {
  constructor({ cause }) {
    super("User Operation rejected by EntryPoint's `simulateValidation` during account creation or validation.", {
      cause,
      name: "UserOperationRejectedByEntryPointError"
    });
  }
}
Object.defineProperty(UserOperationRejectedByEntryPointError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32500
});
class UserOperationRejectedByPaymasterError extends BaseError$1 {
  constructor({ cause }) {
    super("User Operation rejected by Paymaster's `validatePaymasterUserOp`.", {
      cause,
      name: "UserOperationRejectedByPaymasterError"
    });
  }
}
Object.defineProperty(UserOperationRejectedByPaymasterError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32501
});
class UserOperationRejectedByOpCodeError extends BaseError$1 {
  constructor({ cause }) {
    super("User Operation rejected with op code validation error.", {
      cause,
      name: "UserOperationRejectedByOpCodeError"
    });
  }
}
Object.defineProperty(UserOperationRejectedByOpCodeError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32502
});
class UserOperationOutOfTimeRangeError extends BaseError$1 {
  constructor({ cause }) {
    super("UserOperation out of time-range: either wallet or paymaster returned a time-range, and it is already expired (or will expire soon).", {
      cause,
      name: "UserOperationOutOfTimeRangeError"
    });
  }
}
Object.defineProperty(UserOperationOutOfTimeRangeError, "code", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: -32503
});
class UnknownBundlerError extends BaseError$1 {
  constructor({ cause }) {
    super(`An error occurred while executing user operation: ${cause == null ? void 0 : cause.shortMessage}`, {
      cause,
      name: "UnknownBundlerError"
    });
  }
}
class VerificationGasLimitExceededError extends BaseError$1 {
  constructor({ cause }) {
    super("User Operation verification gas limit exceeded.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the gas used for verification exceeded the `verificationGasLimit`"
      ].filter(Boolean),
      name: "VerificationGasLimitExceededError"
    });
  }
}
Object.defineProperty(VerificationGasLimitExceededError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa40/
});
class VerificationGasLimitTooLowError extends BaseError$1 {
  constructor({ cause }) {
    super("User Operation verification gas limit is too low.", {
      cause,
      metaMessages: [
        "This could arise when:",
        "- the `verificationGasLimit` is too low to verify the User Operation"
      ].filter(Boolean),
      name: "VerificationGasLimitTooLowError"
    });
  }
}
Object.defineProperty(VerificationGasLimitTooLowError, "message", {
  enumerable: true,
  configurable: true,
  writable: true,
  value: /aa41/
});
class UserOperationExecutionError extends BaseError$1 {
  constructor(cause, { callData, callGasLimit, docsPath, factory, factoryData, initCode, maxFeePerGas, maxPriorityFeePerGas, nonce, paymaster, paymasterAndData, paymasterData, paymasterPostOpGasLimit, paymasterVerificationGasLimit, preVerificationGas, sender, signature, verificationGasLimit }) {
    const prettyArgs = prettyPrint({
      callData,
      callGasLimit,
      factory,
      factoryData,
      initCode,
      maxFeePerGas: typeof maxFeePerGas !== "undefined" && `${formatGwei(maxFeePerGas)} gwei`,
      maxPriorityFeePerGas: typeof maxPriorityFeePerGas !== "undefined" && `${formatGwei(maxPriorityFeePerGas)} gwei`,
      nonce,
      paymaster,
      paymasterAndData,
      paymasterData,
      paymasterPostOpGasLimit,
      paymasterVerificationGasLimit,
      preVerificationGas,
      sender,
      signature,
      verificationGasLimit
    });
    super(cause.shortMessage, {
      cause,
      docsPath,
      metaMessages: [
        ...cause.metaMessages ? [...cause.metaMessages, " "] : [],
        "Request Arguments:",
        prettyArgs
      ].filter(Boolean),
      name: "UserOperationExecutionError"
    });
    Object.defineProperty(this, "cause", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.cause = cause;
  }
}
class UserOperationReceiptNotFoundError extends BaseError$1 {
  constructor({ hash }) {
    super(`User Operation receipt with hash "${hash}" could not be found. The User Operation may not have been processed yet.`, { name: "UserOperationReceiptNotFoundError" });
  }
}
class UserOperationNotFoundError extends BaseError$1 {
  constructor({ hash }) {
    super(`User Operation with hash "${hash}" could not be found.`, {
      name: "UserOperationNotFoundError"
    });
  }
}
class WaitForUserOperationReceiptTimeoutError extends BaseError$1 {
  constructor({ hash }) {
    super(`Timed out while waiting for User Operation with hash "${hash}" to be confirmed.`, { name: "WaitForUserOperationReceiptTimeoutError" });
  }
}
const bundlerErrors = [
  ExecutionRevertedError,
  InvalidFieldsError,
  PaymasterDepositTooLowError,
  PaymasterRateLimitError,
  PaymasterStakeTooLowError,
  SignatureCheckFailedError,
  UnsupportedSignatureAggregatorError,
  UserOperationOutOfTimeRangeError,
  UserOperationRejectedByEntryPointError,
  UserOperationRejectedByPaymasterError,
  UserOperationRejectedByOpCodeError
];
function getBundlerError(err, args) {
  const message = (err.details || "").toLowerCase();
  if (AccountNotDeployedError.message.test(message))
    return new AccountNotDeployedError({
      cause: err
    });
  if (FailedToSendToBeneficiaryError.message.test(message))
    return new FailedToSendToBeneficiaryError({
      cause: err
    });
  if (GasValuesOverflowError.message.test(message))
    return new GasValuesOverflowError({
      cause: err
    });
  if (HandleOpsOutOfGasError.message.test(message))
    return new HandleOpsOutOfGasError({
      cause: err
    });
  if (InitCodeFailedError.message.test(message))
    return new InitCodeFailedError({
      cause: err,
      factory: args.factory,
      factoryData: args.factoryData,
      initCode: args.initCode
    });
  if (InitCodeMustCreateSenderError.message.test(message))
    return new InitCodeMustCreateSenderError({
      cause: err,
      factory: args.factory,
      factoryData: args.factoryData,
      initCode: args.initCode
    });
  if (InitCodeMustReturnSenderError.message.test(message))
    return new InitCodeMustReturnSenderError({
      cause: err,
      factory: args.factory,
      factoryData: args.factoryData,
      initCode: args.initCode,
      sender: args.sender
    });
  if (InsufficientPrefundError.message.test(message))
    return new InsufficientPrefundError({
      cause: err
    });
  if (InternalCallOnlyError.message.test(message))
    return new InternalCallOnlyError({
      cause: err
    });
  if (InvalidAccountNonceError.message.test(message))
    return new InvalidAccountNonceError({
      cause: err,
      nonce: args.nonce
    });
  if (InvalidAggregatorError.message.test(message))
    return new InvalidAggregatorError({
      cause: err
    });
  if (InvalidBeneficiaryError.message.test(message))
    return new InvalidBeneficiaryError({
      cause: err
    });
  if (InvalidPaymasterAndDataError.message.test(message))
    return new InvalidPaymasterAndDataError({
      cause: err
    });
  if (PaymasterDepositTooLowError.message.test(message))
    return new PaymasterDepositTooLowError({
      cause: err
    });
  if (PaymasterFunctionRevertedError.message.test(message))
    return new PaymasterFunctionRevertedError({
      cause: err
    });
  if (PaymasterNotDeployedError.message.test(message))
    return new PaymasterNotDeployedError({
      cause: err
    });
  if (PaymasterPostOpFunctionRevertedError.message.test(message))
    return new PaymasterPostOpFunctionRevertedError({
      cause: err
    });
  if (SmartAccountFunctionRevertedError.message.test(message))
    return new SmartAccountFunctionRevertedError({
      cause: err
    });
  if (SenderAlreadyConstructedError.message.test(message))
    return new SenderAlreadyConstructedError({
      cause: err,
      factory: args.factory,
      factoryData: args.factoryData,
      initCode: args.initCode
    });
  if (UserOperationExpiredError.message.test(message))
    return new UserOperationExpiredError({
      cause: err
    });
  if (UserOperationPaymasterExpiredError.message.test(message))
    return new UserOperationPaymasterExpiredError({
      cause: err
    });
  if (UserOperationPaymasterSignatureError.message.test(message))
    return new UserOperationPaymasterSignatureError({
      cause: err
    });
  if (UserOperationSignatureError.message.test(message))
    return new UserOperationSignatureError({
      cause: err
    });
  if (VerificationGasLimitExceededError.message.test(message))
    return new VerificationGasLimitExceededError({
      cause: err
    });
  if (VerificationGasLimitTooLowError.message.test(message))
    return new VerificationGasLimitTooLowError({
      cause: err
    });
  const error = err.walk((e) => bundlerErrors.some((error2) => error2.code === e.code));
  if (error) {
    if (error.code === ExecutionRevertedError.code)
      return new ExecutionRevertedError({
        cause: err,
        data: error.data,
        message: error.details
      });
    if (error.code === InvalidFieldsError.code)
      return new InvalidFieldsError({
        cause: err
      });
    if (error.code === PaymasterDepositTooLowError.code)
      return new PaymasterDepositTooLowError({
        cause: err
      });
    if (error.code === PaymasterRateLimitError.code)
      return new PaymasterRateLimitError({
        cause: err
      });
    if (error.code === PaymasterStakeTooLowError.code)
      return new PaymasterStakeTooLowError({
        cause: err
      });
    if (error.code === SignatureCheckFailedError.code)
      return new SignatureCheckFailedError({
        cause: err
      });
    if (error.code === UnsupportedSignatureAggregatorError.code)
      return new UnsupportedSignatureAggregatorError({
        cause: err
      });
    if (error.code === UserOperationOutOfTimeRangeError.code)
      return new UserOperationOutOfTimeRangeError({
        cause: err
      });
    if (error.code === UserOperationRejectedByEntryPointError.code)
      return new UserOperationRejectedByEntryPointError({
        cause: err
      });
    if (error.code === UserOperationRejectedByPaymasterError.code)
      return new UserOperationRejectedByPaymasterError({
        cause: err
      });
    if (error.code === UserOperationRejectedByOpCodeError.code)
      return new UserOperationRejectedByOpCodeError({
        cause: err
      });
  }
  return new UnknownBundlerError({
    cause: err
  });
}
function getUserOperationError(err, { calls, docsPath, ...args }) {
  const cause = (() => {
    const cause2 = getBundlerError(err, args);
    if (calls && cause2 instanceof ExecutionRevertedError) {
      const revertData = getRevertData(cause2);
      const contractCalls = calls == null ? void 0 : calls.filter((call) => call.abi);
      if (revertData && contractCalls.length > 0)
        return getContractError({ calls: contractCalls, revertData });
    }
    return cause2;
  })();
  return new UserOperationExecutionError(cause, {
    docsPath,
    ...args
  });
}
function getRevertData(error) {
  let revertData;
  error.walk((e) => {
    var _a, _b, _c, _d;
    const error2 = e;
    if (typeof error2.data === "string" || typeof ((_a = error2.data) == null ? void 0 : _a.revertData) === "string" || !(error2 instanceof BaseError$1) && typeof error2.message === "string") {
      const match = (_d = (_c = ((_b = error2.data) == null ? void 0 : _b.revertData) || error2.data || error2.message).match) == null ? void 0 : _d.call(_c, /(0x[A-Za-z0-9]*)/);
      if (match) {
        revertData = match[1];
        return true;
      }
    }
    return false;
  });
  return revertData;
}
function getContractError(parameters) {
  const { calls, revertData } = parameters;
  const { abi, functionName, args, to } = (() => {
    const contractCalls = calls == null ? void 0 : calls.filter((call) => Boolean(call.abi));
    if (contractCalls.length === 1)
      return contractCalls[0];
    const compatContractCalls = contractCalls.filter((call) => {
      try {
        return Boolean(decodeErrorResult({
          abi: call.abi,
          data: revertData
        }));
      } catch {
        return false;
      }
    });
    if (compatContractCalls.length === 1)
      return compatContractCalls[0];
    return {
      abi: [],
      functionName: contractCalls.reduce((acc, call) => `${acc ? `${acc} | ` : ""}${call.functionName}`, ""),
      args: void 0,
      to: void 0
    };
  })();
  const cause = (() => {
    if (revertData === "0x")
      return new ContractFunctionZeroDataError({ functionName });
    return new ContractFunctionRevertedError({
      abi,
      data: revertData,
      functionName
    });
  })();
  return new ContractFunctionExecutionError(cause, {
    abi,
    args,
    contractAddress: to,
    functionName
  });
}
function formatUserOperationGas(parameters) {
  const gas = {};
  if (parameters.callGasLimit)
    gas.callGasLimit = BigInt(parameters.callGasLimit);
  if (parameters.preVerificationGas)
    gas.preVerificationGas = BigInt(parameters.preVerificationGas);
  if (parameters.verificationGasLimit)
    gas.verificationGasLimit = BigInt(parameters.verificationGasLimit);
  if (parameters.paymasterPostOpGasLimit)
    gas.paymasterPostOpGasLimit = BigInt(parameters.paymasterPostOpGasLimit);
  if (parameters.paymasterVerificationGasLimit)
    gas.paymasterVerificationGasLimit = BigInt(parameters.paymasterVerificationGasLimit);
  return gas;
}
function formatUserOperationRequest(request) {
  const rpcRequest = {};
  if (typeof request.callData !== "undefined")
    rpcRequest.callData = request.callData;
  if (typeof request.callGasLimit !== "undefined")
    rpcRequest.callGasLimit = numberToHex(request.callGasLimit);
  if (typeof request.factory !== "undefined")
    rpcRequest.factory = request.factory;
  if (typeof request.factoryData !== "undefined")
    rpcRequest.factoryData = request.factoryData;
  if (typeof request.initCode !== "undefined")
    rpcRequest.initCode = request.initCode;
  if (typeof request.maxFeePerGas !== "undefined")
    rpcRequest.maxFeePerGas = numberToHex(request.maxFeePerGas);
  if (typeof request.maxPriorityFeePerGas !== "undefined")
    rpcRequest.maxPriorityFeePerGas = numberToHex(request.maxPriorityFeePerGas);
  if (typeof request.nonce !== "undefined")
    rpcRequest.nonce = numberToHex(request.nonce);
  if (typeof request.paymaster !== "undefined")
    rpcRequest.paymaster = request.paymaster;
  if (typeof request.paymasterAndData !== "undefined")
    rpcRequest.paymasterAndData = request.paymasterAndData || "0x";
  if (typeof request.paymasterData !== "undefined")
    rpcRequest.paymasterData = request.paymasterData;
  if (typeof request.paymasterPostOpGasLimit !== "undefined")
    rpcRequest.paymasterPostOpGasLimit = numberToHex(request.paymasterPostOpGasLimit);
  if (typeof request.paymasterSignature !== "undefined")
    rpcRequest.paymasterSignature = request.paymasterSignature;
  if (typeof request.paymasterVerificationGasLimit !== "undefined")
    rpcRequest.paymasterVerificationGasLimit = numberToHex(request.paymasterVerificationGasLimit);
  if (typeof request.preVerificationGas !== "undefined")
    rpcRequest.preVerificationGas = numberToHex(request.preVerificationGas);
  if (typeof request.sender !== "undefined")
    rpcRequest.sender = request.sender;
  if (typeof request.signature !== "undefined")
    rpcRequest.signature = request.signature;
  if (typeof request.verificationGasLimit !== "undefined")
    rpcRequest.verificationGasLimit = numberToHex(request.verificationGasLimit);
  if (typeof request.authorization !== "undefined")
    rpcRequest.eip7702Auth = formatAuthorization(request.authorization);
  return rpcRequest;
}
function formatAuthorization(authorization) {
  return {
    address: authorization.address,
    chainId: numberToHex(authorization.chainId),
    nonce: numberToHex(authorization.nonce),
    r: authorization.r ? numberToHex(BigInt(authorization.r), { size: 32 }) : pad$1("0x", { size: 32 }),
    s: authorization.s ? numberToHex(BigInt(authorization.s), { size: 32 }) : pad$1("0x", { size: 32 }),
    yParity: typeof authorization.yParity !== "undefined" ? numberToHex(authorization.yParity, { size: 1 }) : pad$1("0x", { size: 32 })
  };
}
async function getPaymasterData(client, parameters) {
  const { chainId, entryPointAddress, context, ...userOperation } = parameters;
  const request = formatUserOperationRequest(userOperation);
  const { paymasterPostOpGasLimit, paymasterVerificationGasLimit, ...rest } = await client.request({
    method: "pm_getPaymasterData",
    params: [
      {
        ...request,
        callGasLimit: request.callGasLimit ?? "0x0",
        verificationGasLimit: request.verificationGasLimit ?? "0x0",
        preVerificationGas: request.preVerificationGas ?? "0x0"
      },
      entryPointAddress,
      numberToHex(chainId),
      context
    ]
  });
  return {
    ...rest,
    ...paymasterPostOpGasLimit && {
      paymasterPostOpGasLimit: hexToBigInt(paymasterPostOpGasLimit)
    },
    ...paymasterVerificationGasLimit && {
      paymasterVerificationGasLimit: hexToBigInt(paymasterVerificationGasLimit)
    }
  };
}
async function getPaymasterStubData(client, parameters) {
  const { chainId, entryPointAddress, context, ...userOperation } = parameters;
  const request = formatUserOperationRequest(userOperation);
  const { paymasterPostOpGasLimit, paymasterVerificationGasLimit, ...rest } = await client.request({
    method: "pm_getPaymasterStubData",
    params: [
      {
        ...request,
        callGasLimit: request.callGasLimit ?? "0x0",
        verificationGasLimit: request.verificationGasLimit ?? "0x0",
        preVerificationGas: request.preVerificationGas ?? "0x0"
      },
      entryPointAddress,
      numberToHex(chainId),
      context
    ]
  });
  return {
    ...rest,
    ...paymasterPostOpGasLimit && {
      paymasterPostOpGasLimit: hexToBigInt(paymasterPostOpGasLimit)
    },
    ...paymasterVerificationGasLimit && {
      paymasterVerificationGasLimit: hexToBigInt(paymasterVerificationGasLimit)
    }
  };
}
const defaultParameters = [
  "factory",
  "fees",
  "gas",
  "paymaster",
  "nonce",
  "signature",
  "authorization"
];
async function prepareUserOperation(client, parameters_) {
  var _a, _b;
  const parameters = parameters_;
  const { account: account_ = client.account, dataSuffix = typeof client.dataSuffix === "string" ? client.dataSuffix : (_a = client.dataSuffix) == null ? void 0 : _a.value, parameters: properties = defaultParameters, stateOverride } = parameters;
  if (!account_)
    throw new AccountNotFoundError();
  const account = parseAccount(account_);
  const bundlerClient = client;
  const paymaster = parameters.paymaster ?? (bundlerClient == null ? void 0 : bundlerClient.paymaster);
  const paymasterAddress = typeof paymaster === "string" ? paymaster : void 0;
  const { getPaymasterStubData: getPaymasterStubData$1, getPaymasterData: getPaymasterData$1 } = (() => {
    if (paymaster === true)
      return {
        getPaymasterStubData: (parameters2) => getAction(bundlerClient, getPaymasterStubData, "getPaymasterStubData")(parameters2),
        getPaymasterData: (parameters2) => getAction(bundlerClient, getPaymasterData, "getPaymasterData")(parameters2)
      };
    if (typeof paymaster === "object") {
      const { getPaymasterStubData: getPaymasterStubData2, getPaymasterData: getPaymasterData2 } = paymaster;
      return {
        getPaymasterStubData: getPaymasterData2 && getPaymasterStubData2 ? getPaymasterStubData2 : getPaymasterData2,
        getPaymasterData: getPaymasterData2 && getPaymasterStubData2 ? getPaymasterData2 : void 0
      };
    }
    return {
      getPaymasterStubData: void 0,
      getPaymasterData: void 0
    };
  })();
  const paymasterContext = parameters.paymasterContext ? parameters.paymasterContext : bundlerClient == null ? void 0 : bundlerClient.paymasterContext;
  let request = {
    ...parameters,
    paymaster: paymasterAddress,
    sender: account.address
  };
  const [callData, factory, fees, nonce, authorization] = await Promise.all([
    (async () => {
      if (parameters.calls)
        return account.encodeCalls(parameters.calls.map((call_) => {
          const call = call_;
          if (call.abi)
            return {
              data: encodeFunctionData(call),
              to: call.to,
              value: call.value
            };
          return call;
        }));
      return parameters.callData;
    })(),
    (async () => {
      if (!properties.includes("factory"))
        return void 0;
      if (parameters.initCode)
        return { initCode: parameters.initCode };
      if (parameters.factory && parameters.factoryData) {
        return {
          factory: parameters.factory,
          factoryData: parameters.factoryData
        };
      }
      const { factory: factory2, factoryData } = await account.getFactoryArgs();
      if (account.entryPoint.version === "0.6")
        return {
          initCode: factory2 && factoryData ? concat$1([factory2, factoryData]) : void 0
        };
      return {
        factory: factory2,
        factoryData
      };
    })(),
    (async () => {
      var _a2;
      if (!properties.includes("fees"))
        return void 0;
      if (typeof parameters.maxFeePerGas === "bigint" && typeof parameters.maxPriorityFeePerGas === "bigint")
        return request;
      if ((_a2 = bundlerClient == null ? void 0 : bundlerClient.userOperation) == null ? void 0 : _a2.estimateFeesPerGas) {
        const fees2 = await bundlerClient.userOperation.estimateFeesPerGas({
          account,
          bundlerClient,
          userOperation: request
        });
        return {
          ...request,
          ...fees2
        };
      }
      try {
        const client_ = bundlerClient.client ?? client;
        const fees2 = await getAction(client_, estimateFeesPerGas, "estimateFeesPerGas")({
          chain: client_.chain,
          type: "eip1559"
        });
        return {
          maxFeePerGas: typeof parameters.maxFeePerGas === "bigint" ? parameters.maxFeePerGas : BigInt(
            // Bundlers unfortunately have strict rules on fee prechecks – we will need to set a generous buffer.
            2n * fees2.maxFeePerGas
          ),
          maxPriorityFeePerGas: typeof parameters.maxPriorityFeePerGas === "bigint" ? parameters.maxPriorityFeePerGas : BigInt(
            // Bundlers unfortunately have strict rules on fee prechecks – we will need to set a generous buffer.
            2n * fees2.maxPriorityFeePerGas
          )
        };
      } catch {
        return void 0;
      }
    })(),
    (async () => {
      if (!properties.includes("nonce"))
        return void 0;
      if (typeof parameters.nonce === "bigint")
        return parameters.nonce;
      return account.getNonce();
    })(),
    (async () => {
      if (!properties.includes("authorization"))
        return void 0;
      if (typeof parameters.authorization === "object")
        return parameters.authorization;
      if (account.authorization && !await account.isDeployed()) {
        const authorization2 = await prepareAuthorization(account.client, account.authorization);
        return {
          ...authorization2,
          r: "0xfffffffffffffffffffffffffffffff000000000000000000000000000000000",
          s: "0x7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          yParity: 1
        };
      }
      return void 0;
    })()
  ]);
  if (typeof callData !== "undefined")
    request.callData = dataSuffix ? concat$1([callData, dataSuffix]) : callData;
  if (typeof factory !== "undefined")
    request = { ...request, ...factory };
  if (typeof fees !== "undefined")
    request = { ...request, ...fees };
  if (typeof nonce !== "undefined")
    request.nonce = nonce;
  if (typeof authorization !== "undefined")
    request.authorization = authorization;
  if (properties.includes("signature")) {
    if (typeof parameters.signature !== "undefined")
      request.signature = parameters.signature;
    else
      request.signature = await account.getStubSignature(request);
  }
  if (account.entryPoint.version === "0.6" && !request.initCode)
    request.initCode = "0x";
  let chainId;
  async function getChainId$1() {
    if (chainId)
      return chainId;
    if (client.chain)
      return client.chain.id;
    const chainId_ = await getAction(client, getChainId, "getChainId")({});
    chainId = chainId_;
    return chainId;
  }
  let isPaymasterPopulated = false;
  if (properties.includes("paymaster") && getPaymasterStubData$1 && !paymasterAddress && !parameters.paymasterAndData) {
    const { isFinal = false, sponsor: _, ...paymasterArgs } = await getPaymasterStubData$1({
      chainId: await getChainId$1(),
      entryPointAddress: account.entryPoint.address,
      context: paymasterContext,
      ...request
    });
    isPaymasterPopulated = isFinal;
    request = {
      ...request,
      ...paymasterArgs
    };
  }
  if (account.entryPoint.version === "0.6" && !request.paymasterAndData)
    request.paymasterAndData = "0x";
  if (properties.includes("gas")) {
    if ((_b = account.userOperation) == null ? void 0 : _b.estimateGas) {
      const gas = await account.userOperation.estimateGas(request);
      request = {
        ...request,
        ...gas
      };
    }
    if (typeof request.callGasLimit === "undefined" || typeof request.preVerificationGas === "undefined" || typeof request.verificationGasLimit === "undefined" || request.paymaster && typeof request.paymasterPostOpGasLimit === "undefined" || request.paymaster && typeof request.paymasterVerificationGasLimit === "undefined") {
      const gas = await getAction(bundlerClient, estimateUserOperationGas, "estimateUserOperationGas")({
        account,
        // Some Bundlers fail if nullish gas values are provided for gas estimation :') –
        // so we will need to set a default zeroish value.
        callGasLimit: 0n,
        preVerificationGas: 0n,
        verificationGasLimit: 0n,
        stateOverride,
        ...request.paymaster ? {
          paymasterPostOpGasLimit: 0n,
          paymasterVerificationGasLimit: 0n
        } : {},
        ...request
      });
      request = {
        ...request,
        callGasLimit: request.callGasLimit ?? gas.callGasLimit,
        preVerificationGas: request.preVerificationGas ?? gas.preVerificationGas,
        verificationGasLimit: request.verificationGasLimit ?? gas.verificationGasLimit,
        paymasterPostOpGasLimit: request.paymasterPostOpGasLimit ?? gas.paymasterPostOpGasLimit,
        paymasterVerificationGasLimit: request.paymasterVerificationGasLimit ?? gas.paymasterVerificationGasLimit
      };
    }
  }
  if (properties.includes("paymaster") && getPaymasterData$1 && !paymasterAddress && !parameters.paymasterAndData && !isPaymasterPopulated) {
    const paymaster2 = await getPaymasterData$1({
      chainId: await getChainId$1(),
      entryPointAddress: account.entryPoint.address,
      context: paymasterContext,
      ...request
    });
    request = {
      ...request,
      ...paymaster2
    };
  }
  delete request.calls;
  delete request.parameters;
  delete request.paymasterContext;
  if (typeof request.paymaster !== "string")
    delete request.paymaster;
  return request;
}
async function estimateUserOperationGas(client, parameters) {
  var _a;
  const { account: account_ = client.account, entryPointAddress, stateOverride } = parameters;
  if (!account_ && !parameters.sender)
    throw new AccountNotFoundError();
  const account = account_ ? parseAccount(account_) : void 0;
  const rpcStateOverride = serializeStateOverride(stateOverride);
  const request = account ? await getAction(client, prepareUserOperation, "prepareUserOperation")({
    ...parameters,
    parameters: [
      "authorization",
      "factory",
      "fees",
      "nonce",
      "paymaster",
      "signature"
    ]
  }) : parameters;
  try {
    const params = [
      formatUserOperationRequest(request),
      entryPointAddress ?? ((_a = account == null ? void 0 : account.entryPoint) == null ? void 0 : _a.address)
    ];
    const result = await client.request({
      method: "eth_estimateUserOperationGas",
      params: rpcStateOverride ? [...params, rpcStateOverride] : [...params]
    });
    return formatUserOperationGas(result);
  } catch (error) {
    const calls = parameters.calls;
    throw getUserOperationError(error, {
      ...request,
      ...calls ? { calls } : {}
    });
  }
}
function getSupportedEntryPoints(client) {
  return client.request({ method: "eth_supportedEntryPoints" });
}
function formatUserOperation(parameters) {
  const userOperation = { ...parameters };
  if (parameters.callGasLimit)
    userOperation.callGasLimit = BigInt(parameters.callGasLimit);
  if (parameters.maxFeePerGas)
    userOperation.maxFeePerGas = BigInt(parameters.maxFeePerGas);
  if (parameters.maxPriorityFeePerGas)
    userOperation.maxPriorityFeePerGas = BigInt(parameters.maxPriorityFeePerGas);
  if (parameters.nonce)
    userOperation.nonce = BigInt(parameters.nonce);
  if (parameters.paymasterPostOpGasLimit)
    userOperation.paymasterPostOpGasLimit = BigInt(parameters.paymasterPostOpGasLimit);
  if (parameters.paymasterVerificationGasLimit)
    userOperation.paymasterVerificationGasLimit = BigInt(parameters.paymasterVerificationGasLimit);
  if (parameters.preVerificationGas)
    userOperation.preVerificationGas = BigInt(parameters.preVerificationGas);
  if (parameters.verificationGasLimit)
    userOperation.verificationGasLimit = BigInt(parameters.verificationGasLimit);
  return userOperation;
}
async function getUserOperation(client, { hash }) {
  const result = await client.request({
    method: "eth_getUserOperationByHash",
    params: [hash]
  }, { dedupe: true });
  if (!result)
    throw new UserOperationNotFoundError({ hash });
  const { blockHash, blockNumber, entryPoint, transactionHash, userOperation } = result;
  return {
    blockHash,
    blockNumber: BigInt(blockNumber),
    entryPoint,
    transactionHash,
    userOperation: formatUserOperation(userOperation)
  };
}
function formatUserOperationReceipt(parameters) {
  const receipt = { ...parameters };
  if (parameters.actualGasCost)
    receipt.actualGasCost = BigInt(parameters.actualGasCost);
  if (parameters.actualGasUsed)
    receipt.actualGasUsed = BigInt(parameters.actualGasUsed);
  if (parameters.logs)
    receipt.logs = parameters.logs.map((log) => formatLog(log));
  if (parameters.receipt)
    receipt.receipt = formatTransactionReceipt(receipt.receipt);
  return receipt;
}
async function getUserOperationReceipt(client, { hash }) {
  const receipt = await client.request({
    method: "eth_getUserOperationReceipt",
    params: [hash]
  }, { dedupe: true });
  if (!receipt)
    throw new UserOperationReceiptNotFoundError({ hash });
  return formatUserOperationReceipt(receipt);
}
async function sendUserOperation(client, parameters) {
  var _a, _b;
  const { account: account_ = client.account, entryPointAddress } = parameters;
  if (!account_ && !parameters.sender)
    throw new AccountNotFoundError();
  const account = account_ ? parseAccount(account_) : void 0;
  const request = account ? await getAction(client, prepareUserOperation, "prepareUserOperation")(parameters) : parameters;
  const signature = parameters.signature || await ((_a = account == null ? void 0 : account.signUserOperation) == null ? void 0 : _a.call(account, request));
  const rpcParameters = formatUserOperationRequest({
    ...request,
    signature
  });
  try {
    return await client.request({
      method: "eth_sendUserOperation",
      params: [
        rpcParameters,
        entryPointAddress ?? ((_b = account == null ? void 0 : account.entryPoint) == null ? void 0 : _b.address)
      ]
    }, { retryCount: 0 });
  } catch (error) {
    const calls = parameters.calls;
    throw getUserOperationError(error, {
      ...request,
      ...calls ? { calls } : {},
      signature
    });
  }
}
function waitForUserOperationReceipt(client, parameters) {
  const { hash, pollingInterval = client.pollingInterval, retryCount, timeout = 12e4 } = parameters;
  let count = 0;
  const observerId = stringify$1([
    "waitForUserOperationReceipt",
    client.uid,
    hash
  ]);
  return new Promise((resolve, reject) => {
    const unobserve = observe(observerId, { resolve, reject }, (emit) => {
      const done = (fn) => {
        unpoll();
        fn();
        unobserve();
      };
      const timeoutId = timeout ? setTimeout(() => done(() => emit.reject(new WaitForUserOperationReceiptTimeoutError({ hash }))), timeout) : void 0;
      const unpoll = poll(async () => {
        if (retryCount && count >= retryCount) {
          clearTimeout(timeoutId);
          done(() => emit.reject(new WaitForUserOperationReceiptTimeoutError({ hash })));
        }
        try {
          const receipt = await getAction(client, getUserOperationReceipt, "getUserOperationReceipt")({ hash });
          clearTimeout(timeoutId);
          done(() => emit.resolve(receipt));
        } catch (err) {
          const error = err;
          if (error.name !== "UserOperationReceiptNotFoundError") {
            clearTimeout(timeoutId);
            done(() => emit.reject(error));
          }
        }
        count++;
      }, {
        emitOnBegin: true,
        interval: pollingInterval
      });
      return unpoll;
    });
  });
}
function bundlerActions(client) {
  return {
    estimateUserOperationGas: (parameters) => estimateUserOperationGas(client, parameters),
    getChainId: () => getChainId(client),
    getSupportedEntryPoints: () => getSupportedEntryPoints(client),
    getUserOperation: (parameters) => getUserOperation(client, parameters),
    getUserOperationReceipt: (parameters) => getUserOperationReceipt(client, parameters),
    prepareUserOperation: (parameters) => prepareUserOperation(client, parameters),
    sendUserOperation: (parameters) => sendUserOperation(client, parameters),
    waitForUserOperationReceipt: (parameters) => waitForUserOperationReceipt(client, parameters)
  };
}
function createBundlerClient(parameters) {
  const { client: client_, dataSuffix, key = "bundler", name = "Bundler Client", paymaster, paymasterContext, transport, userOperation } = parameters;
  const client = Object.assign(createClient({
    ...parameters,
    chain: parameters.chain ?? (client_ == null ? void 0 : client_.chain),
    key,
    name,
    transport,
    type: "bundlerClient"
  }), {
    client: client_,
    dataSuffix: dataSuffix ?? (client_ == null ? void 0 : client_.dataSuffix),
    paymaster,
    paymasterContext,
    userOperation
  });
  return client.extend(bundlerActions);
}
const version = "0.1.1";
function getVersion() {
  return version;
}
class BaseError extends Error {
  constructor(shortMessage, options = {}) {
    const details = (() => {
      var _a;
      if (options.cause instanceof BaseError) {
        if (options.cause.details)
          return options.cause.details;
        if (options.cause.shortMessage)
          return options.cause.shortMessage;
      }
      if ((_a = options.cause) == null ? void 0 : _a.message)
        return options.cause.message;
      return options.details;
    })();
    const docsPath = (() => {
      if (options.cause instanceof BaseError)
        return options.cause.docsPath || options.docsPath;
      return options.docsPath;
    })();
    const docsBaseUrl = "https://oxlib.sh";
    const docs = `${docsBaseUrl}${docsPath ?? ""}`;
    const message = [
      shortMessage || "An error occurred.",
      ...options.metaMessages ? ["", ...options.metaMessages] : [],
      ...details || docsPath ? [
        "",
        details ? `Details: ${details}` : void 0,
        docsPath ? `See: ${docs}` : void 0
      ] : []
    ].filter((x) => typeof x === "string").join("\n");
    super(message, options.cause ? { cause: options.cause } : void 0);
    Object.defineProperty(this, "details", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "docs", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "docsPath", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "shortMessage", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "cause", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "BaseError"
    });
    Object.defineProperty(this, "version", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: `ox@${getVersion()}`
    });
    this.cause = options.cause;
    this.details = details;
    this.docs = docs;
    this.docsPath = docsPath;
    this.shortMessage = shortMessage;
  }
  walk(fn) {
    return walk(this, fn);
  }
}
function walk(err, fn) {
  if (fn == null ? void 0 : fn(err))
    return err;
  if (err && typeof err === "object" && "cause" in err && err.cause)
    return walk(err.cause, fn);
  return fn ? null : err;
}
const bigIntSuffix = "#__bigint";
function stringify(value, replacer, space) {
  return JSON.stringify(value, (key, value2) => {
    if (typeof value2 === "bigint")
      return value2.toString() + bigIntSuffix;
    return value2;
  }, space);
}
function assertSize$1(bytes, size_) {
  if (size(bytes) > size_)
    throw new SizeOverflowError2({
      givenSize: size(bytes),
      maxSize: size_
    });
}
function assertStartOffset$1(value, start) {
  if (typeof start === "number" && start > 0 && start > size(value) - 1)
    throw new SliceOffsetOutOfBoundsError2({
      offset: start,
      position: "start",
      size: size(value)
    });
}
function assertEndOffset$1(value, start, end) {
  if (typeof start === "number" && typeof end === "number" && size(value) !== end - start) {
    throw new SliceOffsetOutOfBoundsError2({
      offset: end,
      position: "end",
      size: size(value)
    });
  }
}
const charCodeMap = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function charCodeToBase16(char) {
  if (char >= charCodeMap.zero && char <= charCodeMap.nine)
    return char - charCodeMap.zero;
  if (char >= charCodeMap.A && char <= charCodeMap.F)
    return char - (charCodeMap.A - 10);
  if (char >= charCodeMap.a && char <= charCodeMap.f)
    return char - (charCodeMap.a - 10);
  return void 0;
}
function assertSize(hex, size_) {
  if (size$1(hex) > size_)
    throw new SizeOverflowError$1({
      givenSize: size$1(hex),
      maxSize: size_
    });
}
function assertStartOffset(value, start) {
  if (typeof start === "number" && start > 0 && start > size$1(value) - 1)
    throw new SliceOffsetOutOfBoundsError$1({
      offset: start,
      position: "start",
      size: size$1(value)
    });
}
function assertEndOffset(value, start, end) {
  if (typeof start === "number" && typeof end === "number" && size$1(value) !== end - start) {
    throw new SliceOffsetOutOfBoundsError$1({
      offset: end,
      position: "end",
      size: size$1(value)
    });
  }
}
function pad(hex_, options = {}) {
  const { dir, size: size2 = 32 } = options;
  if (size2 === 0)
    return hex_;
  const hex = hex_.replace("0x", "");
  if (hex.length > size2 * 2)
    throw new SizeExceedsPaddingSizeError({
      size: Math.ceil(hex.length / 2),
      targetSize: size2,
      type: "Hex"
    });
  return `0x${hex[dir === "right" ? "padEnd" : "padStart"](size2 * 2, "0")}`;
}
const encoder = /* @__PURE__ */ new TextEncoder();
const hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_v, i) => i.toString(16).padStart(2, "0"));
function assert$3(value, options = {}) {
  const { strict = false } = options;
  if (!value)
    throw new InvalidHexTypeError(value);
  if (typeof value !== "string")
    throw new InvalidHexTypeError(value);
  if (strict) {
    if (!/^0x[0-9a-fA-F]*$/.test(value))
      throw new InvalidHexValueError(value);
  }
  if (!value.startsWith("0x"))
    throw new InvalidHexValueError(value);
}
function concat(...values) {
  return `0x${values.reduce((acc, x) => acc + x.replace("0x", ""), "")}`;
}
function from$2(value) {
  if (value instanceof Uint8Array)
    return fromBytes$2(value);
  if (Array.isArray(value))
    return fromBytes$2(new Uint8Array(value));
  return value;
}
function fromBytes$2(value, options = {}) {
  let string = "";
  for (let i = 0; i < value.length; i++)
    string += hexes[value[i]];
  const hex = `0x${string}`;
  if (typeof options.size === "number") {
    assertSize(hex, options.size);
    return padRight(hex, options.size);
  }
  return hex;
}
function fromNumber(value, options = {}) {
  const { signed, size: size2 } = options;
  const value_ = BigInt(value);
  let maxValue;
  if (size2) {
    if (signed)
      maxValue = (1n << BigInt(size2) * 8n - 1n) - 1n;
    else
      maxValue = 2n ** (BigInt(size2) * 8n) - 1n;
  } else if (typeof value === "number") {
    maxValue = BigInt(Number.MAX_SAFE_INTEGER);
  }
  const minValue = typeof maxValue === "bigint" && signed ? -maxValue - 1n : 0;
  if (maxValue && value_ > maxValue || value_ < minValue) {
    const suffix = typeof value === "bigint" ? "n" : "";
    throw new IntegerOutOfRangeError({
      max: maxValue ? `${maxValue}${suffix}` : void 0,
      min: `${minValue}${suffix}`,
      signed,
      size: size2,
      value: `${value}${suffix}`
    });
  }
  const stringValue = (signed && value_ < 0 ? (1n << BigInt(size2 * 8)) + BigInt(value_) : value_).toString(16);
  const hex = `0x${stringValue}`;
  if (size2)
    return padLeft(hex, size2);
  return hex;
}
function fromString(value, options = {}) {
  return fromBytes$2(encoder.encode(value), options);
}
function padLeft(value, size2) {
  return pad(value, { dir: "left", size: size2 });
}
function padRight(value, size2) {
  return pad(value, { dir: "right", size: size2 });
}
function slice$1(value, start, end, options = {}) {
  const { strict } = options;
  assertStartOffset(value, start);
  const value_ = `0x${value.replace("0x", "").slice((start ?? 0) * 2, (end ?? value.length) * 2)}`;
  if (strict)
    assertEndOffset(value_, start, end);
  return value_;
}
function size$1(value) {
  return Math.ceil((value.length - 2) / 2);
}
function toBigInt$1(hex, options = {}) {
  const { signed } = options;
  if (options.size)
    assertSize(hex, options.size);
  const value = BigInt(hex);
  if (!signed)
    return value;
  const size2 = (hex.length - 2) / 2;
  const max_unsigned = (1n << BigInt(size2) * 8n) - 1n;
  const max_signed = max_unsigned >> 1n;
  if (value <= max_signed)
    return value;
  return value - max_unsigned - 1n;
}
function validate$1(value, options = {}) {
  const { strict = false } = options;
  try {
    assert$3(value, { strict });
    return true;
  } catch {
    return false;
  }
}
class IntegerOutOfRangeError extends BaseError {
  constructor({ max, min, signed, size: size2, value }) {
    super(`Number \`${value}\` is not in safe${size2 ? ` ${size2 * 8}-bit` : ""}${signed ? " signed" : " unsigned"} integer range ${max ? `(\`${min}\` to \`${max}\`)` : `(above \`${min}\`)`}`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Hex.IntegerOutOfRangeError"
    });
  }
}
class InvalidHexTypeError extends BaseError {
  constructor(value) {
    super(`Value \`${typeof value === "object" ? stringify(value) : value}\` of type \`${typeof value}\` is an invalid hex type.`, {
      metaMessages: ['Hex types must be represented as `"0x${string}"`.']
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Hex.InvalidHexTypeError"
    });
  }
}
class InvalidHexValueError extends BaseError {
  constructor(value) {
    super(`Value \`${value}\` is an invalid hex value.`, {
      metaMessages: [
        'Hex values must start with `"0x"` and contain only hexadecimal characters (0-9, a-f, A-F).'
      ]
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Hex.InvalidHexValueError"
    });
  }
}
let SizeOverflowError$1 = class SizeOverflowError extends BaseError {
  constructor({ givenSize, maxSize }) {
    super(`Size cannot exceed \`${maxSize}\` bytes. Given size: \`${givenSize}\` bytes.`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Hex.SizeOverflowError"
    });
  }
};
let SliceOffsetOutOfBoundsError$1 = class SliceOffsetOutOfBoundsError extends BaseError {
  constructor({ offset, position, size: size2 }) {
    super(`Slice ${position === "start" ? "starting" : "ending"} at offset \`${offset}\` is out-of-bounds (size: \`${size2}\`).`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Hex.SliceOffsetOutOfBoundsError"
    });
  }
};
class SizeExceedsPaddingSizeError extends BaseError {
  constructor({ size: size2, targetSize, type }) {
    super(`${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} size (\`${size2}\`) exceeds padding size (\`${targetSize}\`).`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Hex.SizeExceedsPaddingSizeError"
    });
  }
}
function assert$2(value) {
  if (value instanceof Uint8Array)
    return;
  if (!value)
    throw new InvalidBytesTypeError(value);
  if (typeof value !== "object")
    throw new InvalidBytesTypeError(value);
  if (!("BYTES_PER_ELEMENT" in value))
    throw new InvalidBytesTypeError(value);
  if (value.BYTES_PER_ELEMENT !== 1 || value.constructor.name !== "Uint8Array")
    throw new InvalidBytesTypeError(value);
}
function from$1(value) {
  if (value instanceof Uint8Array)
    return value;
  if (typeof value === "string")
    return fromHex$3(value);
  return fromArray(value);
}
function fromArray(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
function fromHex$3(value, options = {}) {
  const { size: size2 } = options;
  let hex = value;
  if (size2) {
    assertSize(value, size2);
    hex = padRight(value, size2);
  }
  let hexString = hex.slice(2);
  if (hexString.length % 2)
    hexString = `0${hexString}`;
  const length = hexString.length / 2;
  const bytes = new Uint8Array(length);
  for (let index = 0, j = 0; index < length; index++) {
    const nibbleLeft = charCodeToBase16(hexString.charCodeAt(j++));
    const nibbleRight = charCodeToBase16(hexString.charCodeAt(j++));
    if (nibbleLeft === void 0 || nibbleRight === void 0) {
      throw new BaseError(`Invalid byte sequence ("${hexString[j - 2]}${hexString[j - 1]}" in "${hexString}").`);
    }
    bytes[index] = nibbleLeft * 16 + nibbleRight;
  }
  return bytes;
}
function size(value) {
  return value.length;
}
function slice(value, start, end, options = {}) {
  const { strict } = options;
  assertStartOffset$1(value, start);
  const value_ = value.slice(start, end);
  if (strict)
    assertEndOffset$1(value_, start, end);
  return value_;
}
function toBigInt(bytes, options = {}) {
  const { size: size2 } = options;
  if (typeof size2 !== "undefined")
    assertSize$1(bytes, size2);
  const hex = fromBytes$2(bytes, options);
  return toBigInt$1(hex, options);
}
function validate(value) {
  try {
    assert$2(value);
    return true;
  } catch {
    return false;
  }
}
class InvalidBytesTypeError extends BaseError {
  constructor(value) {
    super(`Value \`${typeof value === "object" ? stringify(value) : value}\` of type \`${typeof value}\` is an invalid Bytes value.`, {
      metaMessages: ["Bytes values must be of type `Bytes`."]
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Bytes.InvalidBytesTypeError"
    });
  }
}
class SizeOverflowError2 extends BaseError {
  constructor({ givenSize, maxSize }) {
    super(`Size cannot exceed \`${maxSize}\` bytes. Given size: \`${givenSize}\` bytes.`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Bytes.SizeOverflowError"
    });
  }
}
class SliceOffsetOutOfBoundsError2 extends BaseError {
  constructor({ offset, position, size: size2 }) {
    super(`Slice ${position === "start" ? "starting" : "ending"} at offset \`${offset}\` is out-of-bounds (size: \`${size2}\`).`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Bytes.SliceOffsetOutOfBoundsError"
    });
  }
}
function sha256(value, options = {}) {
  const { as = typeof value === "string" ? "Hex" : "Bytes" } = options;
  const bytes = sha256$1(from$1(value));
  if (as === "Bytes")
    return bytes;
  return fromBytes$2(bytes);
}
function assert$1(publicKey, options = {}) {
  const { compressed } = options;
  const { prefix, x, y } = publicKey;
  if (compressed === false || typeof x === "bigint" && typeof y === "bigint") {
    if (prefix !== 4)
      throw new InvalidPrefixError({
        prefix,
        cause: new InvalidUncompressedPrefixError()
      });
    return;
  }
  if (compressed === true || typeof x === "bigint" && typeof y === "undefined") {
    if (prefix !== 3 && prefix !== 2)
      throw new InvalidPrefixError({
        prefix,
        cause: new InvalidCompressedPrefixError()
      });
    return;
  }
  throw new InvalidError({ publicKey });
}
function from(value) {
  const publicKey = (() => {
    if (validate$1(value))
      return fromHex$2(value);
    if (validate(value))
      return fromBytes$1(value);
    const { prefix, x, y } = value;
    if (typeof x === "bigint" && typeof y === "bigint")
      return { prefix: prefix ?? 4, x, y };
    return { prefix, x };
  })();
  assert$1(publicKey);
  return publicKey;
}
function fromBytes$1(publicKey) {
  return fromHex$2(fromBytes$2(publicKey));
}
function fromHex$2(publicKey) {
  if (publicKey.length !== 132 && publicKey.length !== 130 && publicKey.length !== 68)
    throw new InvalidSerializedSizeError$1({ publicKey });
  if (publicKey.length === 130) {
    const x2 = BigInt(slice$1(publicKey, 0, 32));
    const y = BigInt(slice$1(publicKey, 32, 64));
    return {
      prefix: 4,
      x: x2,
      y
    };
  }
  if (publicKey.length === 132) {
    const prefix2 = Number(slice$1(publicKey, 0, 1));
    const x2 = BigInt(slice$1(publicKey, 1, 33));
    const y = BigInt(slice$1(publicKey, 33, 65));
    return {
      prefix: prefix2,
      x: x2,
      y
    };
  }
  const prefix = Number(slice$1(publicKey, 0, 1));
  const x = BigInt(slice$1(publicKey, 1, 33));
  return {
    prefix,
    x
  };
}
function toHex$1(publicKey, options = {}) {
  assert$1(publicKey);
  const { prefix, x, y } = publicKey;
  const { includePrefix = true } = options;
  const publicKey_ = concat(
    includePrefix ? fromNumber(prefix, { size: 1 }) : "0x",
    fromNumber(x, { size: 32 }),
    // If the public key is not compressed, add the y coordinate.
    typeof y === "bigint" ? fromNumber(y, { size: 32 }) : "0x"
  );
  return publicKey_;
}
class InvalidError extends BaseError {
  constructor({ publicKey }) {
    super(`Value \`${stringify(publicKey)}\` is not a valid public key.`, {
      metaMessages: [
        "Public key must contain:",
        "- an `x` and `prefix` value (compressed)",
        "- an `x`, `y`, and `prefix` value (uncompressed)"
      ]
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "PublicKey.InvalidError"
    });
  }
}
class InvalidPrefixError extends BaseError {
  constructor({ prefix, cause }) {
    super(`Prefix "${prefix}" is invalid.`, {
      cause
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "PublicKey.InvalidPrefixError"
    });
  }
}
class InvalidCompressedPrefixError extends BaseError {
  constructor() {
    super("Prefix must be 2 or 3 for compressed public keys.");
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "PublicKey.InvalidCompressedPrefixError"
    });
  }
}
class InvalidUncompressedPrefixError extends BaseError {
  constructor() {
    super("Prefix must be 4 for uncompressed public keys.");
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "PublicKey.InvalidUncompressedPrefixError"
    });
  }
}
let InvalidSerializedSizeError$1 = class InvalidSerializedSizeError extends BaseError {
  constructor({ publicKey }) {
    super(`Value \`${publicKey}\` is an invalid public key size.`, {
      metaMessages: [
        "Expected: 33 bytes (compressed + prefix), 64 bytes (uncompressed) or 65 bytes (uncompressed + prefix).",
        `Received ${size$1(from$2(publicKey))} bytes.`
      ]
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "PublicKey.InvalidSerializedSizeError"
    });
  }
};
const maxUint256 = 2n ** 256n - 1n;
function assert(signature, options = {}) {
  const { recovered } = options;
  if (typeof signature.r === "undefined")
    throw new MissingPropertiesError({ signature });
  if (typeof signature.s === "undefined")
    throw new MissingPropertiesError({ signature });
  if (recovered && typeof signature.yParity === "undefined")
    throw new MissingPropertiesError({ signature });
  if (signature.r < 0n || signature.r > maxUint256)
    throw new InvalidRError({ value: signature.r });
  if (signature.s < 0n || signature.s > maxUint256)
    throw new InvalidSError({ value: signature.s });
  if (typeof signature.yParity === "number" && signature.yParity !== 0 && signature.yParity !== 1)
    throw new InvalidYParityError({ value: signature.yParity });
}
function fromHex$1(signature) {
  if (signature.length !== 130 && signature.length !== 132)
    throw new InvalidSerializedSizeError2({ signature });
  const r = BigInt(slice$1(signature, 0, 32));
  const s = BigInt(slice$1(signature, 32, 64));
  const yParity = (() => {
    const yParity2 = Number(`0x${signature.slice(130)}`);
    if (Number.isNaN(yParity2))
      return void 0;
    try {
      return vToYParity(yParity2);
    } catch {
      throw new InvalidYParityError({ value: yParity2 });
    }
  })();
  if (typeof yParity === "undefined")
    return {
      r,
      s
    };
  return {
    r,
    s,
    yParity
  };
}
function toHex(signature) {
  assert(signature);
  const r = signature.r;
  const s = signature.s;
  const signature_ = concat(
    fromNumber(r, { size: 32 }),
    fromNumber(s, { size: 32 }),
    // If the signature is recovered, add the recovery byte to the signature.
    typeof signature.yParity === "number" ? fromNumber(yParityToV(signature.yParity), { size: 1 }) : "0x"
  );
  return signature_;
}
function vToYParity(v) {
  if (v === 0 || v === 27)
    return 0;
  if (v === 1 || v === 28)
    return 1;
  if (v >= 35)
    return v % 2 === 0 ? 1 : 0;
  throw new InvalidVError({ value: v });
}
function yParityToV(yParity) {
  if (yParity === 0)
    return 27;
  if (yParity === 1)
    return 28;
  throw new InvalidYParityError({ value: yParity });
}
class InvalidSerializedSizeError2 extends BaseError {
  constructor({ signature }) {
    super(`Value \`${signature}\` is an invalid signature size.`, {
      metaMessages: [
        "Expected: 64 bytes or 65 bytes.",
        `Received ${size$1(from$2(signature))} bytes.`
      ]
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Signature.InvalidSerializedSizeError"
    });
  }
}
class MissingPropertiesError extends BaseError {
  constructor({ signature }) {
    super(`Signature \`${stringify(signature)}\` is missing either an \`r\`, \`s\`, or \`yParity\` property.`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Signature.MissingPropertiesError"
    });
  }
}
class InvalidRError extends BaseError {
  constructor({ value }) {
    super(`Value \`${value}\` is an invalid r value. r must be a positive integer less than 2^256.`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Signature.InvalidRError"
    });
  }
}
class InvalidSError extends BaseError {
  constructor({ value }) {
    super(`Value \`${value}\` is an invalid s value. s must be a positive integer less than 2^256.`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Signature.InvalidSError"
    });
  }
}
class InvalidYParityError extends BaseError {
  constructor({ value }) {
    super(`Value \`${value}\` is an invalid y-parity value. Y-parity must be 0 or 1.`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Signature.InvalidYParityError"
    });
  }
}
class InvalidVError extends BaseError {
  constructor({ value }) {
    super(`Value \`${value}\` is an invalid v value. v must be 27, 28 or >=35.`);
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "Signature.InvalidVError"
    });
  }
}
const decoder = /* @__PURE__ */ new TextDecoder();
const integerToCharacter = /* @__PURE__ */ Object.fromEntries(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/").map((a, i) => [i, a.charCodeAt(0)]));
({
  ...Object.fromEntries(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/").map((a, i) => [a.charCodeAt(0), i]))
});
function fromBytes(value, options = {}) {
  const { pad: pad2 = true, url = false } = options;
  const encoded = new Uint8Array(Math.ceil(value.length / 3) * 4);
  for (let i = 0, j = 0; j < value.length; i += 4, j += 3) {
    const y = (value[j] << 16) + (value[j + 1] << 8) + (value[j + 2] | 0);
    encoded[i] = integerToCharacter[y >> 18];
    encoded[i + 1] = integerToCharacter[y >> 12 & 63];
    encoded[i + 2] = integerToCharacter[y >> 6 & 63];
    encoded[i + 3] = integerToCharacter[y & 63];
  }
  const k = value.length % 3;
  const end = Math.floor(value.length / 3) * 4 + (k && k + 1);
  let base64 = decoder.decode(new Uint8Array(encoded.buffer, 0, end));
  if (pad2 && k === 1)
    base64 += "==";
  if (pad2 && k === 2)
    base64 += "=";
  if (url)
    base64 = base64.replaceAll("+", "-").replaceAll("/", "_");
  return base64;
}
function fromHex(value, options = {}) {
  return fromBytes(fromHex$3(value), options);
}
Uint8Array.from([
  105,
  171,
  180,
  181,
  160,
  222,
  75,
  198,
  42,
  42,
  32,
  31,
  141,
  37,
  186,
  233
]);
function getAuthenticatorData(options = {}) {
  const { flag = 5, rpId = window.location.hostname, signCount = 0 } = options;
  const rpIdHash = sha256(fromString(rpId));
  const flag_bytes = fromNumber(flag, { size: 1 });
  const signCount_bytes = fromNumber(signCount, { size: 4 });
  return concat(rpIdHash, flag_bytes, signCount_bytes);
}
function getClientDataJSON(options) {
  const { challenge, crossOrigin = false, extraClientData, origin = window.location.origin } = options;
  return JSON.stringify({
    type: "webauthn.get",
    challenge: fromHex(challenge, { url: true, pad: false }),
    origin,
    crossOrigin,
    ...extraClientData
  });
}
function getSignPayload(options) {
  const { challenge, crossOrigin, extraClientData, flag, origin, rpId, signCount, userVerification = "required" } = options;
  const authenticatorData = getAuthenticatorData({
    flag,
    rpId,
    signCount
  });
  const clientDataJSON = getClientDataJSON({
    challenge,
    crossOrigin,
    extraClientData,
    origin
  });
  const clientDataJSONHash = sha256(fromString(clientDataJSON));
  const challengeIndex = clientDataJSON.indexOf('"challenge"');
  const typeIndex = clientDataJSON.indexOf('"type"');
  const metadata = {
    authenticatorData,
    clientDataJSON,
    challengeIndex,
    typeIndex,
    userVerificationRequired: userVerification === "required"
  };
  const payload = concat(authenticatorData, clientDataJSONHash);
  return { metadata, payload };
}
async function createKeyPair(options = {}) {
  const { extractable = false } = options;
  const keypair = await globalThis.crypto.subtle.generateKey({
    name: "ECDSA",
    namedCurve: "P-256"
  }, extractable, ["sign", "verify"]);
  const publicKey_raw = await globalThis.crypto.subtle.exportKey("raw", keypair.publicKey);
  const publicKey = from(new Uint8Array(publicKey_raw));
  return {
    privateKey: keypair.privateKey,
    publicKey
  };
}
async function sign(options) {
  const { payload, privateKey } = options;
  const signature = await globalThis.crypto.subtle.sign({
    name: "ECDSA",
    hash: "SHA-256"
  }, privateKey, from$1(payload));
  const signature_bytes = fromArray(new Uint8Array(signature));
  const r = toBigInt(slice(signature_bytes, 0, 32));
  let s = toBigInt(slice(signature_bytes, 32, 64));
  if (s > p256.CURVE.n / 2n)
    s = p256.CURVE.n - s;
  return { r, s };
}
export {
  sign as a,
  toHex as b,
  createBundlerClient as c,
  createKeyPair as d,
  toSmartAccount as e,
  fromHex$1 as f,
  getSignPayload as g,
  entryPoint06Address as h,
  entryPoint06Abi as i,
  getUserOperationHash as j,
  slice$1 as s,
  toHex$1 as t
};

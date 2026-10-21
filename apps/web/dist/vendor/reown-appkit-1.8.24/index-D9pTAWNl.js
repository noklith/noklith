import { g3 as parseAbiParameter$1, g4 as modifiers, g5 as parseStructs, g6 as isStructSignature, g7 as InvalidAbiParameterError, cm as getAction, co as readContract, g8 as writeContract, db as toBytes, Z as getAddress, cl as pad, aC as keccak256, a7 as slice, P as concat, g9 as toRlp, dg as decodeFunctionResult, aj as batchGatewayAbi, b2 as encodeFunctionData, K as decodeErrorResult, ak as solidityError, V as HttpRequestError, ga as InvalidHexValueError, d3 as hexToBytes, gb as createCursor, gc as RlpTrailingBytesError, gd as RlpDepthLimitExceededError, aA as bytesToHex, H as BaseError, ge as RlpListBoundaryExceededError, X as isHex, aB as size, gf as ripemd160$1, aI as toHex, em as createBatchScheduler, a3 as withTimeout, dN as TimeoutError, gg as SocketClosedError, gh as WebSocketRequestError, du as sliceHex, gi as validate, ab as decodeAbiParameters, gj as unwrap, a0 as numberToHex, gk as recoverAddress, gl as wrap, L as isAddressEqual, d7 as hexToNumber, gm as InvalidSerializedTransactionTypeError, gn as InvalidSerializedTransactionError, cv as hexToBigInt, go as assertTransactionEIP1559, gp as assertTransactionEIP2930, gq as toBlobSidecars, gr as assertTransactionEIP4844, gs as assertTransactionEIP7702, gt as assertTransactionLegacy, gu as InvalidLegacyVError, aE as isAddress, aF as InvalidAddressError, d4 as trim, gv as InvalidYParityError, gw as padHex, gx as fromEther, gy as fromGwei, df as parseEventLogs, d6 as erc20Abi, cw as AccountNotFoundError, dC as assertRequest, gz as recoverAuthorizationAddress, cx as parseAccount, cz as getChainId, gA as assertCurrentChain, dD as formatTransactionRequest, dE as extract, dL as LruMap, ea as waitForTransactionReceipt, e7 as TransactionReceiptRevertedError, ec as prepareTransactionRequest, gB as defaultParameters, gC as AccountTypeNotSupportedError, ds as getTransactionError, e5 as formatUnits, cF as createClient, gD as encodeDeployData, dr as sendTransaction, gE as checksumAddress, ek as bindActionDecorators, gF as signMessage, eb as sendRawTransaction, ef as fillTransaction, el as createTransport, gG as TransactionRejectedRpcError, a1 as UserRejectedRequestError, gH as WalletConnectSessionSettlementError, gI as ExecutionRevertedError, gJ as wait, en as RpcRequestError, gK as AbiConstructorNotFoundError, gL as AbiConstructorParamsNotFoundError, gM as commitmentToVersionedHash, eo as secp256k1, gN as serializeTransaction, gO as AbiDecodingDataSizeInvalidError, gP as AbiDecodingDataSizeTooSmallError, dU as AbiDecodingZeroDataError, gQ as AbiEncodingArrayLengthMismatchError, gR as AbiEncodingBytesSizeMismatchError, dH as AbiEncodingLengthMismatchError, ae as AbiErrorInputsNotFoundError, ad as AbiErrorNotFoundError, gS as AbiErrorSignatureNotFoundError, d9 as AbiEventNotFoundError, gT as AbiEventSignatureEmptyTopicsError, gU as AbiEventSignatureNotFoundError, ag as AbiFunctionNotFoundError, ah as AbiFunctionOutputsNotFoundError, aa as AbiFunctionSignatureNotFoundError, gV as AccountStateConflictError, gW as AtomicReadyWalletRejectedUpgradeError, dq as AtomicityNotSupportedError, gX as BaseFeeScalarError, dG as BlockNotFoundError, gY as BundleTooLargeError, aH as BytesSizeMismatchError, gZ as CallExecutionError, g_ as ChainDisconnectedError, g$ as ChainDoesNotSupportContract, h0 as ChainMismatchError, h1 as ChainNotFoundError, h2 as CircularReferenceError, h3 as ClientChainNotConfiguredError, cu as ContractFunctionExecutionError, ct as ContractFunctionRevertedError, cs as ContractFunctionZeroDataError, h4 as CounterfactualDeploymentFailedError, dm as DecodeLogDataMismatch, dn as DecodeLogTopicsMismatch, h5 as DuplicateIdError, h6 as Eip1559FeesNotSupportedError, h7 as EstimateGasExecutionError, h8 as FeeCapTooHighError, h9 as FeeCapTooLowError, ha as FeeConflictError, hb as InsufficientFundsError, hc as IntegerOutOfRangeError, hd as InternalRpcError, he as IntrinsicGasTooHighError, hf as IntrinsicGasTooLowError, hg as InvalidAbiDecodingTypeError, hh as InvalidAbiEncodingTypeError, hi as InvalidAbiItemError, hj as InvalidAbiParametersError, hk as InvalidAbiTypeParameterError, ai as InvalidArrayError, hl as InvalidBytesBooleanError, hm as InvalidChainIdError, hn as InvalidDefinitionTypeError, ho as InvalidFunctionModifierError, hp as InvalidHexBooleanError, dj as InvalidInputRpcError, hq as InvalidModifierError, hr as InvalidParameterError, hs as InvalidParamsRpcError, ht as InvalidParenthesisError, hu as InvalidRequestRpcError, hv as InvalidSerializableTransactionError, hw as InvalidSignatureError, hx as InvalidStorageKeySizeError, hy as InvalidStructSignatureError, hz as JsonRpcVersionUnsupportedError, hA as LimitExceededRpcError, hB as MaxFeePerGasTooLowError, hC as MethodNotFoundRpcError, hD as MethodNotSupportedRpcError, hE as NonceMaxValueError, hF as NonceTooHighError, hG as NonceTooLowError, hH as ParseRpcError, hI as ProviderDisconnectedError, hJ as ProviderRpcError$1, dV as RawContractError, hK as ResourceNotFoundRpcError, hL as ResourceUnavailableRpcError, dO as ResponseBodyTooLargeError, hM as RpcError, hN as SizeExceedsPaddingSizeError, hO as SizeOverflowError, hP as SliceOffsetOutOfBoundsError, hQ as SolidityProtectedKeywordError, hR as StateAssignmentConflictError, _ as SwitchChainError, hS as TipAboveFeeCapError, hT as TransactionExecutionError, dQ as TransactionNotFoundError, hU as TransactionReceiptNotFoundError, hV as TransactionTypeNotSupportedError, hW as UnauthorizedProviderError, hX as UnknownBundleIdError, dX as UnknownNodeError, hY as UnknownRpcError, hZ as UnknownSignatureError, h_ as UnknownTypeError, h$ as UnsupportedChainIdError, dp as UnsupportedNonOptionalCapabilityError, dK as UnsupportedPackedAbiType, i0 as UnsupportedProviderMethodError, i1 as WaitForTransactionReceiptTimeoutError, i2 as blobsToCommitments, i3 as blobsToProofs, i4 as boolToBytes, dI as boolToHex, i5 as bytesToBigInt, i6 as bytesToBool, i7 as bytesToNumber, i8 as bytesToRlp, i9 as bytesToString, ia as commitmentsToVersionedHashes, ib as concatBytes, af as concatHex, ic as custom, dl as decodeEventLog, id as defineBlock, d1 as defineChain, ie as defineTransaction, ig as defineTransactionReceipt, ih as defineTransactionRequest, e2 as deploylessCallViaBytecodeBytecode, ii as deploylessCallViaFactoryBytecode, Q as encodeAbiParameters, ij as erc1155Abi, ik as erc20Abi_bytes32, il as erc4626Abi, im as erc6492SignatureValidatorAbi, io as erc6492SignatureValidatorByteCode, ip as erc721Abi, iq as etherUnits, ir as extendSchema, dT as formatBlock, is as formatEther, cr as formatGwei, cB as formatLog, it as formatTransaction, cC as formatTransactionReceipt, iu as fromBytes, iv as fromHex, ac as getAbiItem, dx as getChainContractAddress, de as getContractError, da as toEventSelector, iw as toSignature, a8 as toFunctionSelector, ix as getTransactionType, iy as gweiUnits, iz as hexToBool, iA as hexToRlp, d5 as hexToString, iB as maxInt104, iC as maxInt112, iD as maxInt120, iE as maxInt128, iF as maxInt136, iG as maxInt144, iH as maxInt152, iI as maxInt16, iJ as maxInt160, iK as maxInt168, iL as maxInt176, iM as maxInt184, iN as maxInt192, iO as maxInt200, iP as maxInt208, iQ as maxInt216, iR as maxInt224, iS as maxInt232, iT as maxInt24, iU as maxInt240, iV as maxInt248, iW as maxInt256, iX as maxInt32, iY as maxInt40, iZ as maxInt48, i_ as maxInt56, i$ as maxInt64, j0 as maxInt72, j1 as maxInt8, j2 as maxInt80, j3 as maxInt88, j4 as maxInt96, j5 as maxUint104, j6 as maxUint112, j7 as maxUint120, j8 as maxUint128, j9 as maxUint136, ja as maxUint144, jb as maxUint152, jc as maxUint16, jd as maxUint160, je as maxUint168, jf as maxUint176, jg as maxUint184, jh as maxUint192, ji as maxUint200, jj as maxUint208, jk as maxUint216, jl as maxUint224, jm as maxUint232, jn as maxUint24, jo as maxUint240, jp as maxUint248, jq as maxUint256, jr as maxUint32, js as maxUint40, jt as maxUint48, ju as maxUint56, jv as maxUint64, jw as maxUint72, jx as maxUint8, jy as maxUint80, jz as maxUint88, jA as maxUint96, jB as minInt104, jC as minInt112, jD as minInt120, jE as minInt128, jF as minInt136, jG as minInt144, jH as minInt152, jI as minInt16, jJ as minInt160, jK as minInt168, jL as minInt176, jM as minInt184, jN as minInt192, jO as minInt200, jP as minInt208, jQ as minInt216, jR as minInt224, jS as minInt232, jT as minInt24, jU as minInt240, jV as minInt248, jW as minInt256, jX as minInt32, jY as minInt40, jZ as minInt48, j_ as minInt56, j$ as minInt64, k0 as minInt72, k1 as minInt8, k2 as minInt80, k3 as minInt88, k4 as minInt96, k5 as multicall3Abi, k6 as numberToBytes, k7 as padBytes, cp as parseAbi, f0 as parseAbiItem, e_ as parseAbiParameters, e6 as parseUnits, k8 as prepareEncodeFunctionData, k9 as recoverPublicKey, ka as rpcSchema, kb as rpcTransactionType, kc as serializeAccessList, kd as serializeSignature, ke as setErrorConfig, kf as sha256, kg as sliceBytes, d2 as stringToBytes, az as stringToHex, J as stringify, kh as toBlobs, ki as toSignatureHash, kj as transactionType, kk as weiUnits, kl as withCache, dw as withRetry } from "./appkit-DSMu6gPS.js";
import { d as simulateContract, f as createContractEventFilter, g as getContractEvents, i as watchContractEvent, j as estimateContractGas, k as idCache, l as erc6492MagicBytes, m as defineCall, n as pickWriteParameters, r as resolveToken, t as toBaseUnits, o as sendRawTransactionSync, q as resolveAmountDecimals, u as sendCalls, w as waitForCallsStatus, p as prepareAuthorization, v as getCallsStatus, U as UrlRequiredError, E as EnsInvalidChainIdError, B as BundleFailedError, x as EnsAvatarInvalidNftUriError, y as EnsAvatarUnsupportedNamespaceError, z as EnsAvatarUriResolutionError, F as FilterTypeNotSupportedError, W as WaitForCallsStatusTimeoutError, c as createNonceManager, a as createPublicClient, A as encodeEventTopics, e as encodePacked, C as ethAddress, b as parseSignature, h as http, D as labelhash, G as namehash, H as nonceManager, I as publicActions, s as serializeErc6492Signature, J as zeroAddress, K as zeroHash } from "./parseSignature-mj1PKMOX.js";
import { h as hashMessage, a as hashTypedData, g as getTypesForEIP712Domain, v as validateTypedData, s as serializeTypedData, I as InvalidDomainError, b as InvalidPrimaryTypeError, c as InvalidStructTypeError, d as InvalidTypedDataTypeError, e as domainSeparator, f as hashDomain, i as hashStruct, p as presignMessagePrefix, t as toPrefixedMessage } from "./hashTypedData-Bck5Rcba.js";
import { l as localBatchGatewayUrl, d as decodeFunctionData, e as encodeErrorResult, b as encodeFunctionResult } from "./localBatchGatewayRequest-DqMNS_zi.js";
import { ccipRequest, offchainLookup, offchainLookupAbiItem, offchainLookupSignature } from "./ccip-CUw57dTW.js";
function parseAbiParameter(param) {
  let abiParameter;
  if (typeof param === "string")
    abiParameter = parseAbiParameter$1(param, {
      modifiers
    });
  else {
    const structs = parseStructs(param);
    const length = param.length;
    for (let i = 0; i < length; i++) {
      const signature = param[i];
      if (isStructSignature(signature))
        continue;
      abiParameter = parseAbiParameter$1(signature, { modifiers, structs });
      break;
    }
  }
  if (!abiParameter)
    throw new InvalidAbiParameterError({ param });
  return abiParameter;
}
function getContract({ abi, address, client: client_ }) {
  const client = client_;
  const [publicClient, walletClient] = (() => {
    if (!client)
      return [void 0, void 0];
    if ("public" in client && "wallet" in client)
      return [client.public, client.wallet];
    if ("public" in client)
      return [client.public, void 0];
    if ("wallet" in client)
      return [void 0, client.wallet];
    return [client, client];
  })();
  const hasPublicClient = publicClient !== void 0 && publicClient !== null;
  const hasWalletClient = walletClient !== void 0 && walletClient !== null;
  const contract = {};
  let hasReadFunction = false;
  let hasWriteFunction = false;
  let hasEvent = false;
  for (const item of abi) {
    if (item.type === "function")
      if (item.stateMutability === "view" || item.stateMutability === "pure")
        hasReadFunction = true;
      else
        hasWriteFunction = true;
    else if (item.type === "event")
      hasEvent = true;
    if (hasReadFunction && hasWriteFunction && hasEvent)
      break;
  }
  if (hasPublicClient) {
    if (hasReadFunction)
      contract.read = new Proxy({}, {
        get(_, functionName) {
          return (...parameters) => {
            const { args, options } = getFunctionParameters(parameters);
            return getAction(publicClient, readContract, "readContract")({
              abi,
              address,
              functionName,
              args,
              ...options
            });
          };
        }
      });
    if (hasWriteFunction)
      contract.simulate = new Proxy({}, {
        get(_, functionName) {
          return (...parameters) => {
            const { args, options } = getFunctionParameters(parameters);
            return getAction(publicClient, simulateContract, "simulateContract")({
              abi,
              address,
              functionName,
              args,
              ...options
            });
          };
        }
      });
    if (hasEvent) {
      contract.createEventFilter = new Proxy({}, {
        get(_, eventName) {
          return (...parameters) => {
            const abiEvent = abi.find((x) => x.type === "event" && x.name === eventName);
            const { args, options } = getEventParameters(parameters, abiEvent);
            return getAction(publicClient, createContractEventFilter, "createContractEventFilter")({
              abi,
              address,
              eventName,
              args,
              ...options
            });
          };
        }
      });
      contract.getEvents = new Proxy({}, {
        get(_, eventName) {
          return (...parameters) => {
            const abiEvent = abi.find((x) => x.type === "event" && x.name === eventName);
            const { args, options } = getEventParameters(parameters, abiEvent);
            return getAction(publicClient, getContractEvents, "getContractEvents")({
              abi,
              address,
              eventName,
              args,
              ...options
            });
          };
        }
      });
      contract.watchEvent = new Proxy({}, {
        get(_, eventName) {
          return (...parameters) => {
            const abiEvent = abi.find((x) => x.type === "event" && x.name === eventName);
            const { args, options } = getEventParameters(parameters, abiEvent);
            return getAction(publicClient, watchContractEvent, "watchContractEvent")({
              abi,
              address,
              eventName,
              args,
              ...options
            });
          };
        }
      });
    }
  }
  if (hasWalletClient) {
    if (hasWriteFunction)
      contract.write = new Proxy({}, {
        get(_, functionName) {
          return (...parameters) => {
            const { args, options } = getFunctionParameters(parameters);
            return getAction(walletClient, writeContract, "writeContract")({
              abi,
              address,
              functionName,
              args,
              ...options
            });
          };
        }
      });
  }
  if (hasPublicClient || hasWalletClient) {
    if (hasWriteFunction)
      contract.estimateGas = new Proxy({}, {
        get(_, functionName) {
          return (...parameters) => {
            const { args, options } = getFunctionParameters(parameters);
            const client2 = publicClient ?? walletClient;
            return getAction(client2, estimateContractGas, "estimateContractGas")({
              abi,
              address,
              functionName,
              args,
              ...options,
              account: options.account ?? walletClient.account
            });
          };
        }
      });
  }
  contract.address = address;
  contract.abi = abi;
  return contract;
}
function getFunctionParameters(values) {
  const hasArgs = values.length && Array.isArray(values[0]);
  const args = hasArgs ? values[0] : [];
  const options = (hasArgs ? values[1] : values[0]) ?? {};
  return { args, options };
}
function getEventParameters(values, abiEvent) {
  let hasArgs = false;
  if (Array.isArray(values[0]))
    hasArgs = true;
  else if (values.length === 1) {
    hasArgs = abiEvent.inputs.some((x) => x.indexed);
  } else if (values.length === 2) {
    hasArgs = true;
  }
  const args = hasArgs ? values[0] : void 0;
  const options = (hasArgs ? values[1] : values[0]) ?? {};
  return { args, options };
}
function isBytes(value) {
  if (!value)
    return false;
  if (typeof value !== "object")
    return false;
  if (!("BYTES_PER_ELEMENT" in value))
    return false;
  return value.BYTES_PER_ELEMENT === 1 && value.constructor.name === "Uint8Array";
}
function getContractAddress(opts) {
  if (opts.opcode === "CREATE2")
    return getCreate2Address(opts);
  return getCreateAddress(opts);
}
function getCreateAddress(opts) {
  const from = toBytes(getAddress(opts.from));
  let nonce = toBytes(opts.nonce);
  if (nonce[0] === 0)
    nonce = new Uint8Array([]);
  return getAddress(`0x${keccak256(toRlp([from, nonce], "bytes")).slice(26)}`);
}
function getCreate2Address(opts) {
  const from = toBytes(getAddress(opts.from));
  const salt = pad(isBytes(opts.salt) ? opts.salt : toBytes(opts.salt), {
    size: 32
  });
  const bytecodeHash = (() => {
    if ("bytecodeHash" in opts) {
      if (isBytes(opts.bytecodeHash))
        return opts.bytecodeHash;
      return toBytes(opts.bytecodeHash);
    }
    return keccak256(opts.bytecode, "bytes");
  })();
  return getAddress(slice(keccak256(concat([toBytes("0xff"), from, salt, bytecodeHash])), 12));
}
function ccipReadTunnel({ batchGateways, ccipRequest: ccipRequest$1 = ccipRequest }) {
  return {
    async request({ data, sender, urls }) {
      if (urls.includes(localBatchGatewayUrl)) {
        return ccipRequest$1({
          data,
          sender,
          urls: batchGateways
        });
      } else {
        const [failures, responses] = decodeFunctionResult({
          abi: batchGatewayAbi,
          functionName: "query",
          data: await ccipRequest$1({
            data: encodeFunctionData({
              abi: batchGatewayAbi,
              functionName: "query",
              args: [[{ sender, data, urls }]]
            }),
            sender,
            urls: batchGateways
          })
        });
        if (failures[0]) {
          let error;
          try {
            const res = decodeErrorResult({
              abi: [...batchGatewayAbi, solidityError],
              data: responses[0]
            });
            if (res.errorName === "HttpError") {
              error = new HttpRequestError({
                body: { message: res.args[1] },
                status: res.args[0],
                url: urls.join(" | ")
              });
            } else {
              const message = res.args[0];
              if (message) {
                error = new Error(message);
              }
            }
          } catch {
          }
          throw error ?? new Error("An unknown error occurred.");
        }
        return responses[0];
      }
    }
  };
}
function extractChain({ chains, id }) {
  return chains.find((chain) => chain.id === id);
}
const rlpDepthLimit = 1024;
function fromRlp(value, to = "hex") {
  const bytes = (() => {
    if (typeof value === "string") {
      if (value.length > 3 && value.length % 2 !== 0)
        throw new InvalidHexValueError(value);
      return hexToBytes(value);
    }
    return value;
  })();
  const cursor = createCursor(bytes, {
    recursiveReadLimit: Number.POSITIVE_INFINITY
  });
  const result = fromRlpCursor(cursor, to);
  if (cursor.position < cursor.bytes.length)
    throw new RlpTrailingBytesError({
      count: cursor.bytes.length - cursor.position
    });
  return result;
}
function fromRlpCursor(cursor, to = "hex", recursiveDepth = 0) {
  if (recursiveDepth >= rlpDepthLimit)
    throw new RlpDepthLimitExceededError({ limit: rlpDepthLimit });
  if (cursor.bytes.length === 0)
    return to === "hex" ? bytesToHex(cursor.bytes) : cursor.bytes;
  const prefix = cursor.readByte();
  if (prefix < 128)
    cursor.decrementPosition(1);
  if (prefix < 192) {
    const length2 = readLength(cursor, prefix, 128);
    const bytes = cursor.readBytes(length2);
    return to === "hex" ? bytesToHex(bytes) : bytes;
  }
  const length = readLength(cursor, prefix, 192);
  return readList(cursor, length, to, recursiveDepth + 1);
}
function readLength(cursor, prefix, offset) {
  if (offset === 128 && prefix < 128)
    return 1;
  if (prefix <= offset + 55)
    return prefix - offset;
  if (prefix === offset + 55 + 1)
    return cursor.readUint8();
  if (prefix === offset + 55 + 2)
    return cursor.readUint16();
  if (prefix === offset + 55 + 3)
    return cursor.readUint24();
  if (prefix === offset + 55 + 4)
    return cursor.readUint32();
  throw new BaseError("Invalid RLP prefix");
}
function readList(cursor, length, to, recursiveDepth) {
  const position = cursor.position;
  const value = [];
  while (cursor.position - position < length)
    value.push(fromRlpCursor(cursor, to, recursiveDepth));
  if (cursor.position - position !== length)
    throw new RlpListBoundaryExceededError({
      consumed: cursor.position - position,
      declared: length
    });
  return value;
}
function isHash(hash) {
  return isHex(hash) && size(hash) === 32;
}
function ripemd160(value, to_) {
  const to = to_ || "hex";
  const bytes = ripemd160$1(isHex(value, { strict: false }) ? toBytes(value) : value);
  if (to === "bytes")
    return bytes;
  return toHex(bytes);
}
const socketClientCache = /* @__PURE__ */ new Map();
async function getSocketRpcClient(parameters) {
  const { getSocket: getSocket2, keepAlive = true, key = "socket", reconnect = true, url } = parameters;
  const { interval: keepAliveInterval = 3e4 } = typeof keepAlive === "object" ? keepAlive : {};
  const { attempts = 5, delay = 2e3 } = typeof reconnect === "object" ? reconnect : {};
  const id = JSON.stringify({ keepAlive, key, url, reconnect });
  let socketClient = socketClientCache.get(id);
  if (socketClient)
    return socketClient;
  let reconnectCount = 0;
  const { schedule } = createBatchScheduler({
    id,
    fn: async () => {
      const requests = /* @__PURE__ */ new Map();
      const subscriptions = /* @__PURE__ */ new Map();
      let error;
      let socket;
      let keepAliveTimer;
      let reconnectTimer;
      let reconnectInProgress = false;
      let intentionallyClosed = false;
      function attemptReconnect() {
        if (reconnect && !intentionallyClosed && reconnectCount < attempts) {
          if (reconnectInProgress)
            return;
          reconnectInProgress = true;
          reconnectCount++;
          socket == null ? void 0 : socket.close();
          reconnectTimer = setTimeout(async () => {
            reconnectTimer = void 0;
            if (intentionallyClosed) {
              reconnectInProgress = false;
              return;
            }
            await setup().catch(console.error);
            reconnectInProgress = false;
          }, delay);
        } else {
          requests.clear();
          subscriptions.clear();
        }
      }
      async function setup() {
        const result = await getSocket2({
          onClose() {
            var _a, _b;
            for (const request of requests.values())
              (_a = request.onError) == null ? void 0 : _a.call(request, new SocketClosedError({ url }));
            for (const subscription of subscriptions.values())
              (_b = subscription.onError) == null ? void 0 : _b.call(subscription, new SocketClosedError({ url }));
            attemptReconnect();
          },
          onError(error_) {
            var _a, _b;
            error = error_;
            for (const request of requests.values())
              (_a = request.onError) == null ? void 0 : _a.call(request, error);
            for (const subscription of subscriptions.values())
              (_b = subscription.onError) == null ? void 0 : _b.call(subscription, error);
            attemptReconnect();
          },
          onOpen() {
            error = void 0;
            reconnectCount = 0;
          },
          onResponse(data) {
            const isSubscription = data.method === "eth_subscription";
            const id2 = isSubscription ? data.params.subscription : data.id;
            const cache = isSubscription ? subscriptions : requests;
            const callback = cache.get(id2);
            if (callback)
              callback.onResponse(data);
            if (!isSubscription)
              cache.delete(id2);
          }
        });
        if (intentionallyClosed) {
          result.close();
          return result;
        }
        socket = result;
        if (keepAlive) {
          if (keepAliveTimer)
            clearInterval(keepAliveTimer);
          keepAliveTimer = setInterval(() => {
            var _a;
            return (_a = socket.ping) == null ? void 0 : _a.call(socket);
          }, keepAliveInterval);
        }
        if (reconnect && subscriptions.size > 0) {
          const subscriptionEntries = subscriptions.entries();
          for (const [key2, { onResponse, body, onError }] of subscriptionEntries) {
            if (!body)
              continue;
            subscriptions.delete(key2);
            socketClient == null ? void 0 : socketClient.request({ body, onResponse, onError });
          }
        }
        return result;
      }
      await setup();
      error = void 0;
      socketClient = {
        close() {
          intentionallyClosed = true;
          keepAliveTimer && clearInterval(keepAliveTimer);
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = void 0;
            reconnectInProgress = false;
          }
          socket.close();
          socketClientCache.delete(id);
        },
        get socket() {
          return socket;
        },
        request({ body, onError, onResponse }) {
          var _a;
          if (error && onError)
            onError(error);
          const id2 = body.id ?? idCache.take();
          const callback = (response) => {
            if (typeof response.id === "number" && id2 !== response.id)
              return;
            if (body.method === "eth_subscribe" && typeof response.result === "string")
              subscriptions.set(response.result, {
                onResponse: callback,
                onError,
                body
              });
            onResponse(response);
          };
          if (body.method === "eth_unsubscribe")
            subscriptions.delete((_a = body.params) == null ? void 0 : _a[0]);
          requests.set(id2, { onResponse: callback, onError });
          try {
            socket.request({
              body: {
                jsonrpc: "2.0",
                id: id2,
                ...body
              }
            });
          } catch (error2) {
            onError == null ? void 0 : onError(error2);
          }
        },
        requestAsync({ body, timeout = 1e4 }) {
          return withTimeout(() => new Promise((onResponse, onError) => this.request({
            body,
            onError,
            onResponse
          })), {
            errorInstance: new TimeoutError({ body, url }),
            timeout
          });
        },
        requests,
        subscriptions,
        url
      };
      socketClientCache.set(id, socketClient);
      return [socketClient];
    }
  });
  const [_, [socketClient_]] = await schedule();
  return socketClient_;
}
async function getWebSocketRpcClient(url, options = {}) {
  const { keepAlive, reconnect } = options;
  return getSocketRpcClient({
    async getSocket({ onClose, onError, onOpen, onResponse }) {
      const WebSocket = await import("./native-Dl_COVGi.js").then((module) => module.WebSocket);
      const socket = new WebSocket(url);
      function onClose_() {
        socket.removeEventListener("close", onClose_);
        socket.removeEventListener("message", onMessage);
        socket.removeEventListener("error", onError);
        socket.removeEventListener("open", onOpen);
        onClose();
      }
      function onMessage({ data }) {
        if (typeof data === "string" && data.trim().length === 0)
          return;
        try {
          const _data = JSON.parse(data);
          onResponse(_data);
        } catch (error) {
          onError(error);
        }
      }
      socket.addEventListener("close", onClose_);
      socket.addEventListener("message", onMessage);
      socket.addEventListener("error", onError);
      socket.addEventListener("open", onOpen);
      if (socket.readyState === WebSocket.CONNECTING) {
        await new Promise((resolve, reject) => {
          if (!socket)
            return;
          socket.onopen = resolve;
          socket.onerror = reject;
        });
      }
      const { close: close_ } = socket;
      return Object.assign(socket, {
        close() {
          close_.bind(socket)();
          onClose_();
        },
        ping() {
          try {
            if (socket.readyState === socket.CLOSED || socket.readyState === socket.CLOSING)
              throw new WebSocketRequestError({
                url: socket.url,
                cause: new SocketClosedError({ url: socket.url })
              });
            const body = {
              jsonrpc: "2.0",
              id: null,
              method: "net_version",
              params: []
            };
            socket.send(JSON.stringify(body));
          } catch (error) {
            onError(error);
          }
        },
        request({ body }) {
          if (socket.readyState === socket.CLOSED || socket.readyState === socket.CLOSING)
            throw new WebSocketRequestError({
              body,
              url: socket.url,
              cause: new SocketClosedError({ url: socket.url })
            });
          return socket.send(JSON.stringify(body));
        }
      });
    },
    keepAlive,
    reconnect,
    url
  });
}
async function getSocket(url) {
  const client = await getWebSocketRpcClient(url);
  return Object.assign(client.socket, {
    requests: client.requests,
    subscriptions: client.subscriptions
  });
}
function isErc6492Signature(signature) {
  return sliceHex(signature, -32) === erc6492MagicBytes;
}
function isErc8010Signature(signature) {
  return validate(signature);
}
function parseErc6492Signature(signature) {
  if (!isErc6492Signature(signature))
    return { signature };
  const [address, data, signature_] = decodeAbiParameters([{ type: "address" }, { type: "bytes" }, { type: "bytes" }], signature);
  return { address, data, signature: signature_ };
}
function parseErc8010Signature(signature) {
  if (!isErc8010Signature(signature))
    return { signature };
  const { authorization: authorization_ox, to, ...rest } = unwrap(signature);
  return {
    authorization: {
      address: authorization_ox.address,
      chainId: authorization_ox.chainId,
      nonce: Number(authorization_ox.nonce),
      r: numberToHex(authorization_ox.r, { size: 32 }),
      s: numberToHex(authorization_ox.s, { size: 32 }),
      yParity: authorization_ox.yParity
    },
    ...to ? { address: to } : {},
    ...rest
  };
}
async function recoverMessageAddress({ message, signature }) {
  return recoverAddress({ hash: hashMessage(message), signature });
}
async function recoverTypedDataAddress(parameters) {
  const { domain, message, primaryType, signature, types } = parameters;
  return recoverAddress({
    hash: hashTypedData({
      domain,
      message,
      primaryType,
      types
    }),
    signature
  });
}
function serializeErc8010Signature(parameters) {
  const { address, data, signature, to = "hex" } = parameters;
  const signature_ = wrap({
    authorization: {
      address: parameters.authorization.address,
      chainId: parameters.authorization.chainId,
      nonce: BigInt(parameters.authorization.nonce),
      r: BigInt(parameters.authorization.r),
      s: BigInt(parameters.authorization.s),
      yParity: parameters.authorization.yParity
    },
    data,
    signature,
    to: address
  });
  if (to === "hex")
    return signature_;
  return hexToBytes(signature_);
}
async function verifyHash({ address, hash, signature }) {
  return isAddressEqual(getAddress(address), await recoverAddress({ hash, signature }));
}
async function verifyMessage({ address, message, signature }) {
  return isAddressEqual(getAddress(address), await recoverMessageAddress({ message, signature }));
}
async function verifyTypedData(parameters) {
  const { address, domain, message, primaryType, signature, types } = parameters;
  return isAddressEqual(getAddress(address), await recoverTypedDataAddress({
    domain,
    message,
    primaryType,
    signature,
    types
  }));
}
function getSerializedTransactionType(serializedTransaction) {
  const serializedType = sliceHex(serializedTransaction, 0, 1);
  if (serializedType === "0x04")
    return "eip7702";
  if (serializedType === "0x03")
    return "eip4844";
  if (serializedType === "0x02")
    return "eip1559";
  if (serializedType === "0x01")
    return "eip2930";
  if (serializedType !== "0x" && hexToNumber(serializedType) >= 192)
    return "legacy";
  throw new InvalidSerializedTransactionTypeError({ serializedType });
}
function parseTransaction(serializedTransaction) {
  const type = getSerializedTransactionType(serializedTransaction);
  if (type === "eip1559")
    return parseTransactionEIP1559(serializedTransaction);
  if (type === "eip2930")
    return parseTransactionEIP2930(serializedTransaction);
  if (type === "eip4844")
    return parseTransactionEIP4844(serializedTransaction);
  if (type === "eip7702")
    return parseTransactionEIP7702(serializedTransaction);
  return parseTransactionLegacy(serializedTransaction);
}
function parseTransactionEIP7702(serializedTransaction) {
  const transactionArray = toTransactionArray(serializedTransaction);
  const [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gas, to, value, data, accessList, authorizationList, v, r, s] = transactionArray;
  if (transactionArray.length !== 10 && transactionArray.length !== 13)
    throw new InvalidSerializedTransactionError({
      attributes: {
        chainId,
        nonce,
        maxPriorityFeePerGas,
        maxFeePerGas,
        gas,
        to,
        value,
        data,
        accessList,
        authorizationList,
        ...transactionArray.length > 9 ? {
          v,
          r,
          s
        } : {}
      },
      serializedTransaction,
      type: "eip7702"
    });
  const transaction = {
    chainId: hexToNumber(chainId),
    type: "eip7702"
  };
  if (isHex(to) && to !== "0x")
    transaction.to = to;
  if (isHex(gas) && gas !== "0x")
    transaction.gas = hexToBigInt(gas);
  if (isHex(data) && data !== "0x")
    transaction.data = data;
  if (isHex(nonce))
    transaction.nonce = nonce === "0x" ? 0 : hexToNumber(nonce);
  if (isHex(value) && value !== "0x")
    transaction.value = hexToBigInt(value);
  if (isHex(maxFeePerGas) && maxFeePerGas !== "0x")
    transaction.maxFeePerGas = hexToBigInt(maxFeePerGas);
  if (isHex(maxPriorityFeePerGas) && maxPriorityFeePerGas !== "0x")
    transaction.maxPriorityFeePerGas = hexToBigInt(maxPriorityFeePerGas);
  if (accessList.length !== 0 && accessList !== "0x")
    transaction.accessList = parseAccessList(accessList);
  if (authorizationList.length !== 0 && authorizationList !== "0x")
    transaction.authorizationList = parseAuthorizationList(authorizationList);
  assertTransactionEIP7702(transaction);
  const signature = transactionArray.length === 13 ? parseEIP155Signature(transactionArray) : void 0;
  return { ...signature, ...transaction };
}
function parseTransactionEIP4844(serializedTransaction) {
  const transactionOrWrapperArray = toTransactionArray(serializedTransaction);
  const hasNetworkWrapper = transactionOrWrapperArray.length === 4;
  const transactionArray = hasNetworkWrapper ? transactionOrWrapperArray[0] : transactionOrWrapperArray;
  const wrapperArray = hasNetworkWrapper ? transactionOrWrapperArray.slice(1) : [];
  const [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gas, to, value, data, accessList, maxFeePerBlobGas, blobVersionedHashes, v, r, s] = transactionArray;
  const [blobs, commitments, proofs] = wrapperArray;
  if (!(transactionArray.length === 11 || transactionArray.length === 14))
    throw new InvalidSerializedTransactionError({
      attributes: {
        chainId,
        nonce,
        maxPriorityFeePerGas,
        maxFeePerGas,
        gas,
        to,
        value,
        data,
        accessList,
        ...transactionArray.length > 9 ? {
          v,
          r,
          s
        } : {}
      },
      serializedTransaction,
      type: "eip4844"
    });
  const transaction = {
    blobVersionedHashes,
    chainId: hexToNumber(chainId),
    to,
    type: "eip4844"
  };
  if (isHex(gas) && gas !== "0x")
    transaction.gas = hexToBigInt(gas);
  if (isHex(data) && data !== "0x")
    transaction.data = data;
  if (isHex(nonce))
    transaction.nonce = nonce === "0x" ? 0 : hexToNumber(nonce);
  if (isHex(value) && value !== "0x")
    transaction.value = hexToBigInt(value);
  if (isHex(maxFeePerBlobGas) && maxFeePerBlobGas !== "0x")
    transaction.maxFeePerBlobGas = hexToBigInt(maxFeePerBlobGas);
  if (isHex(maxFeePerGas) && maxFeePerGas !== "0x")
    transaction.maxFeePerGas = hexToBigInt(maxFeePerGas);
  if (isHex(maxPriorityFeePerGas) && maxPriorityFeePerGas !== "0x")
    transaction.maxPriorityFeePerGas = hexToBigInt(maxPriorityFeePerGas);
  if (accessList.length !== 0 && accessList !== "0x")
    transaction.accessList = parseAccessList(accessList);
  if (blobs && commitments && proofs)
    transaction.sidecars = toBlobSidecars({
      blobs,
      commitments,
      proofs
    });
  assertTransactionEIP4844(transaction);
  const signature = transactionArray.length === 14 ? parseEIP155Signature(transactionArray) : void 0;
  return { ...signature, ...transaction };
}
function parseTransactionEIP1559(serializedTransaction) {
  const transactionArray = toTransactionArray(serializedTransaction);
  const [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gas, to, value, data, accessList, v, r, s] = transactionArray;
  if (!(transactionArray.length === 9 || transactionArray.length === 12))
    throw new InvalidSerializedTransactionError({
      attributes: {
        chainId,
        nonce,
        maxPriorityFeePerGas,
        maxFeePerGas,
        gas,
        to,
        value,
        data,
        accessList,
        ...transactionArray.length > 9 ? {
          v,
          r,
          s
        } : {}
      },
      serializedTransaction,
      type: "eip1559"
    });
  const transaction = {
    chainId: hexToNumber(chainId),
    type: "eip1559"
  };
  if (isHex(to) && to !== "0x")
    transaction.to = to;
  if (isHex(gas) && gas !== "0x")
    transaction.gas = hexToBigInt(gas);
  if (isHex(data) && data !== "0x")
    transaction.data = data;
  if (isHex(nonce))
    transaction.nonce = nonce === "0x" ? 0 : hexToNumber(nonce);
  if (isHex(value) && value !== "0x")
    transaction.value = hexToBigInt(value);
  if (isHex(maxFeePerGas) && maxFeePerGas !== "0x")
    transaction.maxFeePerGas = hexToBigInt(maxFeePerGas);
  if (isHex(maxPriorityFeePerGas) && maxPriorityFeePerGas !== "0x")
    transaction.maxPriorityFeePerGas = hexToBigInt(maxPriorityFeePerGas);
  if (accessList.length !== 0 && accessList !== "0x")
    transaction.accessList = parseAccessList(accessList);
  assertTransactionEIP1559(transaction);
  const signature = transactionArray.length === 12 ? parseEIP155Signature(transactionArray) : void 0;
  return { ...signature, ...transaction };
}
function parseTransactionEIP2930(serializedTransaction) {
  const transactionArray = toTransactionArray(serializedTransaction);
  const [chainId, nonce, gasPrice, gas, to, value, data, accessList, v, r, s] = transactionArray;
  if (!(transactionArray.length === 8 || transactionArray.length === 11))
    throw new InvalidSerializedTransactionError({
      attributes: {
        chainId,
        nonce,
        gasPrice,
        gas,
        to,
        value,
        data,
        accessList,
        ...transactionArray.length > 8 ? {
          v,
          r,
          s
        } : {}
      },
      serializedTransaction,
      type: "eip2930"
    });
  const transaction = {
    chainId: hexToNumber(chainId),
    type: "eip2930"
  };
  if (isHex(to) && to !== "0x")
    transaction.to = to;
  if (isHex(gas) && gas !== "0x")
    transaction.gas = hexToBigInt(gas);
  if (isHex(data) && data !== "0x")
    transaction.data = data;
  if (isHex(nonce))
    transaction.nonce = nonce === "0x" ? 0 : hexToNumber(nonce);
  if (isHex(value) && value !== "0x")
    transaction.value = hexToBigInt(value);
  if (isHex(gasPrice) && gasPrice !== "0x")
    transaction.gasPrice = hexToBigInt(gasPrice);
  if (accessList.length !== 0 && accessList !== "0x")
    transaction.accessList = parseAccessList(accessList);
  assertTransactionEIP2930(transaction);
  const signature = transactionArray.length === 11 ? parseEIP155Signature(transactionArray) : void 0;
  return { ...signature, ...transaction };
}
function parseTransactionLegacy(serializedTransaction) {
  const transactionArray = fromRlp(serializedTransaction, "hex");
  const [nonce, gasPrice, gas, to, value, data, chainIdOrV_, r, s] = transactionArray;
  if (!(transactionArray.length === 6 || transactionArray.length === 9))
    throw new InvalidSerializedTransactionError({
      attributes: {
        nonce,
        gasPrice,
        gas,
        to,
        value,
        data,
        ...transactionArray.length > 6 ? {
          v: chainIdOrV_,
          r,
          s
        } : {}
      },
      serializedTransaction,
      type: "legacy"
    });
  const transaction = {
    type: "legacy"
  };
  if (isHex(to) && to !== "0x")
    transaction.to = to;
  if (isHex(gas) && gas !== "0x")
    transaction.gas = hexToBigInt(gas);
  if (isHex(data) && data !== "0x")
    transaction.data = data;
  if (isHex(nonce))
    transaction.nonce = nonce === "0x" ? 0 : hexToNumber(nonce);
  if (isHex(value) && value !== "0x")
    transaction.value = hexToBigInt(value);
  if (isHex(gasPrice) && gasPrice !== "0x")
    transaction.gasPrice = hexToBigInt(gasPrice);
  assertTransactionLegacy(transaction);
  if (transactionArray.length === 6)
    return transaction;
  const chainIdOrV = isHex(chainIdOrV_) && chainIdOrV_ !== "0x" ? hexToBigInt(chainIdOrV_) : 0n;
  if (s === "0x" && r === "0x") {
    if (chainIdOrV > 0)
      transaction.chainId = Number(chainIdOrV);
    return transaction;
  }
  const v = chainIdOrV;
  const chainId = Number((v - 35n) / 2n);
  if (chainId > 0)
    transaction.chainId = chainId;
  else if (v !== 27n && v !== 28n)
    throw new InvalidLegacyVError({ v });
  transaction.v = v;
  transaction.s = s;
  transaction.r = r;
  transaction.yParity = v % 2n === 0n ? 1 : 0;
  return transaction;
}
function toTransactionArray(serializedTransaction) {
  return fromRlp(`0x${serializedTransaction.slice(4)}`, "hex");
}
function parseAccessList(accessList_) {
  const accessList = [];
  for (let i = 0; i < accessList_.length; i++) {
    const [address, storageKeys] = accessList_[i];
    if (!isAddress(address, { strict: false }))
      throw new InvalidAddressError({ address });
    accessList.push({
      address,
      storageKeys: storageKeys.map((key) => isHash(key) ? key : trim(key))
    });
  }
  return accessList;
}
function parseAuthorizationList(serializedAuthorizationList) {
  const authorizationList = [];
  for (let i = 0; i < serializedAuthorizationList.length; i++) {
    const [chainId, address, nonce, yParity, r, s] = serializedAuthorizationList[i];
    authorizationList.push({
      address,
      chainId: chainId === "0x" ? 0 : hexToNumber(chainId),
      nonce: nonce === "0x" ? 0 : hexToNumber(nonce),
      ...parseEIP155Signature([yParity, r, s])
    });
  }
  return authorizationList;
}
function parseEIP155Signature(transactionArray) {
  const signature = transactionArray.slice(-3);
  const yParity = signature[0] === "0x" ? 0n : hexToBigInt(signature[0]);
  if (yParity !== 0n && yParity !== 1n)
    throw new InvalidYParityError({ yParity });
  const v = yParity === 0n ? 27n : 28n;
  return {
    r: padHex(signature[1], { size: 32 }),
    s: padHex(signature[2], { size: 32 }),
    v,
    yParity: v === 27n ? 0 : 1
  };
}
function parseEther(ether, unit = "wei") {
  return fromEther(ether, unit);
}
function parseGwei(ether, unit = "wei") {
  return fromGwei(ether, unit);
}
async function approve(client, parameters) {
  return approve.inner(writeContract, client, parameters);
}
(function(approve2) {
  async function inner(action, client, parameters) {
    return await action(client, {
      ...parameters,
      ...approve2.call(client, parameters)
    });
  }
  approve2.inner = inner;
  function call(client, parameters) {
    return defineCall(getCall$1(client, parameters));
  }
  approve2.call = call;
  async function estimateGas(client, parameters) {
    return estimateContractGas(client, {
      ...pickWriteParameters(parameters),
      ...approve2.call(client, parameters)
    });
  }
  approve2.estimateGas = estimateGas;
  async function simulate(client, parameters) {
    return simulateContract(client, {
      ...pickWriteParameters(parameters),
      ...approve2.call(client, parameters)
    });
  }
  approve2.simulate = simulate;
  function extractEvent(logs) {
    const [log] = parseEventLogs({
      abi: erc20Abi,
      logs,
      eventName: "Approval",
      strict: true
    });
    if (!log)
      throw new Error("`Approval` event not found.");
    return log;
  }
  approve2.extractEvent = extractEvent;
})(approve || (approve = {}));
function getCall$1(client, parameters) {
  const { amount, spender, token } = parameters;
  const { address, decimals } = resolveToken(client, { token });
  return {
    abi: erc20Abi,
    address,
    args: [spender, toBaseUnits(amount, decimals)],
    functionName: "approve"
  };
}
const supportsWalletNamespace = new LruMap(128);
async function sendTransactionSync(client, parameters) {
  var _a, _b, _c, _d, _e, _f;
  const { account: account_ = client.account, assertChainId = true, chain = client.chain, accessList, authorizationList, blobs, data, dataSuffix = typeof client.dataSuffix === "string" ? client.dataSuffix : (_a = client.dataSuffix) == null ? void 0 : _a.value, gas, gasPrice, maxFeePerBlobGas, maxFeePerGas, maxPriorityFeePerGas, nonce, pollingInterval, throwOnReceiptRevert, type, value, ...rest } = parameters;
  const timeout = parameters.timeout ?? Math.max(((chain == null ? void 0 : chain.blockTime) ?? 0) * 3, 5e3);
  if (typeof account_ === "undefined")
    throw new AccountNotFoundError({
      docsPath: "/docs/actions/wallet/sendTransactionSync"
    });
  const account = account_ ? parseAccount(account_) : null;
  let nonceManagerParameters;
  try {
    assertRequest(parameters);
    const to = await (async () => {
      if (parameters.to)
        return parameters.to;
      if (parameters.to === null)
        return void 0;
      if (authorizationList && authorizationList.length > 0)
        return await recoverAuthorizationAddress({
          authorization: authorizationList[0]
        }).catch(() => {
          throw new BaseError("`to` is required. Could not infer from `authorizationList`.");
        });
      return void 0;
    })();
    if ((account == null ? void 0 : account.type) === "json-rpc" || account === null) {
      let chainId;
      if (chain !== null) {
        chainId = await getAction(client, getChainId, "getChainId")({});
        if (assertChainId)
          assertCurrentChain({
            currentChainId: chainId,
            chain
          });
      }
      const chainFormat = (_d = (_c = (_b = client.chain) == null ? void 0 : _b.formatters) == null ? void 0 : _c.transactionRequest) == null ? void 0 : _d.format;
      const format = chainFormat || formatTransactionRequest;
      const request = format({
        // Pick out extra data that might exist on the chain's transaction request type.
        ...extract(rest, { format: chainFormat }),
        accessList,
        account,
        authorizationList,
        blobs,
        chainId,
        data: dataSuffix ? concat([data ?? "0x", dataSuffix]) : data,
        gas,
        gasPrice,
        maxFeePerBlobGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce,
        to,
        type,
        value
      }, "sendTransaction");
      const isWalletNamespaceSupported = supportsWalletNamespace.get(client.uid);
      const method = isWalletNamespaceSupported ? "wallet_sendTransaction" : "eth_sendTransaction";
      const hash = await (async () => {
        try {
          return await client.request({
            method,
            params: [request]
          }, { retryCount: 0 });
        } catch (e) {
          if (isWalletNamespaceSupported === false)
            throw e;
          const error = e;
          if (error.name === "InvalidInputRpcError" || error.name === "InvalidParamsRpcError" || error.name === "MethodNotFoundRpcError" || error.name === "MethodNotSupportedRpcError") {
            return await client.request({
              method: "wallet_sendTransaction",
              params: [request]
            }, { retryCount: 0 }).then((hash2) => {
              supportsWalletNamespace.set(client.uid, true);
              return hash2;
            }).catch((e2) => {
              const walletNamespaceError = e2;
              if (walletNamespaceError.name === "MethodNotFoundRpcError" || walletNamespaceError.name === "MethodNotSupportedRpcError") {
                supportsWalletNamespace.set(client.uid, false);
                throw error;
              }
              throw walletNamespaceError;
            });
          }
          throw error;
        }
      })();
      const receipt = await getAction(client, waitForTransactionReceipt, "waitForTransactionReceipt")({
        checkReplacement: false,
        hash,
        pollingInterval,
        timeout
      });
      if (throwOnReceiptRevert && receipt.status === "reverted")
        throw new TransactionReceiptRevertedError({ receipt });
      return receipt;
    }
    if ((account == null ? void 0 : account.type) === "local") {
      const nonceManager2 = (() => {
        if (!account.nonceManager || typeof nonce !== "undefined")
          return account.nonceManager;
        const nonceManager3 = account.nonceManager;
        return {
          consume(parameters2) {
            nonceManagerParameters = {
              address: parameters2.address,
              chainId: parameters2.chainId
            };
            return nonceManager3.consume(parameters2);
          },
          get(parameters2) {
            return nonceManager3.get(parameters2);
          },
          increment(parameters2) {
            return nonceManager3.increment(parameters2);
          },
          reset(parameters2) {
            return nonceManager3.reset(parameters2);
          }
        };
      })();
      const request = await getAction(client, prepareTransactionRequest, "prepareTransactionRequest")({
        account,
        accessList,
        authorizationList,
        blobs,
        chain,
        data: dataSuffix ? concat([data ?? "0x", dataSuffix]) : data,
        gas,
        gasPrice,
        maxFeePerBlobGas,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce,
        nonceManager: nonceManager2,
        parameters: [...defaultParameters, "sidecars"],
        type,
        value,
        ...rest,
        to
      });
      const serializer = (_e = chain == null ? void 0 : chain.serializers) == null ? void 0 : _e.transaction;
      const serializedTransaction = await account.signTransaction(request, {
        serializer
      });
      return await getAction(client, sendRawTransactionSync, "sendRawTransactionSync")({
        serializedTransaction,
        throwOnReceiptRevert,
        timeout: parameters.timeout
      });
    }
    if ((account == null ? void 0 : account.type) === "smart")
      throw new AccountTypeNotSupportedError({
        metaMessages: [
          "Consider using the `sendUserOperation` Action instead."
        ],
        docsPath: "/docs/actions/bundler/sendUserOperation",
        type: "smart"
      });
    throw new AccountTypeNotSupportedError({
      docsPath: "/docs/actions/wallet/sendTransactionSync",
      type: account == null ? void 0 : account.type
    });
  } catch (err) {
    if (err instanceof AccountTypeNotSupportedError)
      throw err;
    if (nonceManagerParameters && !(err instanceof TransactionReceiptRevertedError))
      (_f = account == null ? void 0 : account.nonceManager) == null ? void 0 : _f.reset(nonceManagerParameters);
    throw getTransactionError(err, {
      ...parameters,
      account,
      chain: parameters.chain || void 0
    });
  }
}
async function writeContractSync(client, parameters) {
  return writeContract.internal(client, sendTransactionSync, "sendTransactionSync", parameters);
}
async function approveSync(client, parameters) {
  const { amount, token, throwOnReceiptRevert = true } = parameters;
  const { decimals } = resolveToken(client, { token });
  const resolved = resolveAmountDecimals(amount, decimals);
  const receipt = await approve.inner(writeContractSync, client, {
    ...parameters,
    throwOnReceiptRevert
  });
  const { args } = approve.extractEvent(receipt.logs);
  return {
    ...args,
    ...resolved === void 0 ? {} : { decimals: resolved, formatted: formatUnits(args.value, resolved) },
    receipt
  };
}
async function transfer(client, parameters) {
  return transfer.inner(writeContract, client, parameters);
}
(function(transfer2) {
  async function inner(action, client, parameters) {
    return await action(client, {
      ...parameters,
      ...transfer2.call(client, parameters)
    });
  }
  transfer2.inner = inner;
  function call(client, parameters) {
    return defineCall(getCall(client, parameters));
  }
  transfer2.call = call;
  async function estimateGas(client, parameters) {
    return estimateContractGas(client, {
      ...pickWriteParameters(parameters),
      ...transfer2.call(client, parameters)
    });
  }
  transfer2.estimateGas = estimateGas;
  async function simulate(client, parameters) {
    return simulateContract(client, {
      ...pickWriteParameters(parameters),
      ...transfer2.call(client, parameters)
    });
  }
  transfer2.simulate = simulate;
  function extractEvent(logs) {
    const [log] = parseEventLogs({
      abi: erc20Abi,
      logs,
      eventName: "Transfer",
      strict: true
    });
    if (!log)
      throw new Error("`Transfer` event not found.");
    return log;
  }
  transfer2.extractEvent = extractEvent;
})(transfer || (transfer = {}));
function getCall(client, parameters) {
  const { amount, from, to, token } = parameters;
  const { address, decimals } = resolveToken(client, { token });
  const value = toBaseUnits(amount, decimals);
  if (from)
    return {
      abi: erc20Abi,
      address,
      args: [from, to, value],
      functionName: "transferFrom"
    };
  return {
    abi: erc20Abi,
    address,
    args: [to, value],
    functionName: "transfer"
  };
}
async function transferSync(client, parameters) {
  const { amount, token, throwOnReceiptRevert = true } = parameters;
  const { decimals } = resolveToken(client, { token });
  const resolved = resolveAmountDecimals(amount, decimals);
  const receipt = await transfer.inner(writeContractSync, client, {
    ...parameters,
    throwOnReceiptRevert
  });
  const { args } = transfer.extractEvent(receipt.logs);
  return {
    ...args,
    ...resolved === void 0 ? {} : { decimals: resolved, formatted: formatUnits(args.value, resolved) },
    receipt
  };
}
async function dropTransaction(client, { hash }) {
  await client.request({
    method: `${client.mode}_dropTransaction`,
    params: [hash]
  });
}
async function dumpState(client) {
  return client.request({
    method: `${client.mode}_dumpState`
  });
}
async function getAutomine(client) {
  if (client.mode === "ganache")
    return await client.request({
      method: "eth_mining"
    });
  return await client.request({
    method: `${client.mode}_getAutomine`
  });
}
async function getTxpoolContent(client) {
  return await client.request({
    method: "txpool_content"
  });
}
async function getTxpoolStatus(client) {
  const { pending, queued } = await client.request({
    method: "txpool_status"
  });
  return {
    pending: hexToNumber(pending),
    queued: hexToNumber(queued)
  };
}
async function impersonateAccount(client, { address }) {
  await client.request({
    method: `${client.mode}_impersonateAccount`,
    params: [address]
  });
}
async function increaseTime(client, { seconds }) {
  return await client.request({
    method: "evm_increaseTime",
    params: [numberToHex(seconds)]
  });
}
async function inspectTxpool(client) {
  return await client.request({
    method: "txpool_inspect"
  });
}
async function loadState(client, { state }) {
  await client.request({
    method: `${client.mode}_loadState`,
    params: [state]
  });
}
async function mine(client, { blocks, interval }) {
  if (client.mode === "ganache")
    await client.request({
      method: "evm_mine",
      params: [{ blocks: numberToHex(blocks) }]
    });
  else
    await client.request({
      method: `${client.mode}_mine`,
      params: [numberToHex(blocks), numberToHex(interval || 0)]
    });
}
async function removeBlockTimestampInterval(client) {
  await client.request({
    method: `${client.mode}_removeBlockTimestampInterval`
  });
}
async function reset(client, { blockNumber, jsonRpcUrl } = {}) {
  await client.request({
    method: `${client.mode}_reset`,
    params: [{ forking: { blockNumber: Number(blockNumber), jsonRpcUrl } }]
  });
}
async function revert(client, { id }) {
  await client.request({
    method: "evm_revert",
    params: [id]
  });
}
async function sendUnsignedTransaction(client, args) {
  var _a, _b, _c;
  const { accessList, data, from, gas, gasPrice, maxFeePerGas, maxPriorityFeePerGas, nonce, to, value, ...rest } = args;
  const chainFormat = (_c = (_b = (_a = client.chain) == null ? void 0 : _a.formatters) == null ? void 0 : _b.transactionRequest) == null ? void 0 : _c.format;
  const format = chainFormat || formatTransactionRequest;
  const request = format({
    // Pick out extra data that might exist on the chain's transaction request type.
    ...extract(rest, { format: chainFormat }),
    accessList,
    data,
    from,
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
    to,
    value
  }, "sendUnsignedTransaction");
  const hash = await client.request({
    method: "eth_sendUnsignedTransaction",
    params: [request]
  });
  return hash;
}
async function setAutomine(client, enabled) {
  if (client.mode === "ganache") {
    if (enabled)
      await client.request({ method: "miner_start" });
    else
      await client.request({ method: "miner_stop" });
  } else
    await client.request({
      method: "evm_setAutomine",
      params: [enabled]
    });
}
async function setBalance(client, { address, value }) {
  if (client.mode === "ganache")
    await client.request({
      method: "evm_setAccountBalance",
      params: [address, numberToHex(value)]
    });
  else
    await client.request({
      method: `${client.mode}_setBalance`,
      params: [address, numberToHex(value)]
    });
}
async function setBlockGasLimit(client, { gasLimit }) {
  await client.request({
    method: "evm_setBlockGasLimit",
    params: [numberToHex(gasLimit)]
  });
}
async function setBlockTimestampInterval(client, { interval }) {
  const interval_ = (() => {
    if (client.mode === "hardhat")
      return interval * 1e3;
    return interval;
  })();
  await client.request({
    method: `${client.mode}_setBlockTimestampInterval`,
    params: [interval_]
  });
}
async function setCode(client, { address, bytecode }) {
  if (client.mode === "ganache")
    await client.request({
      method: "evm_setAccountCode",
      params: [address, bytecode]
    });
  else
    await client.request({
      method: `${client.mode}_setCode`,
      params: [address, bytecode]
    });
}
async function setCoinbase(client, { address }) {
  await client.request({
    method: `${client.mode}_setCoinbase`,
    params: [address]
  });
}
async function setIntervalMining(client, { interval }) {
  const interval_ = (() => {
    if (client.mode === "hardhat")
      return interval * 1e3;
    return interval;
  })();
  await client.request({
    method: "evm_setIntervalMining",
    params: [interval_]
  });
}
async function setLoggingEnabled(client, enabled) {
  await client.request({
    method: `${client.mode}_setLoggingEnabled`,
    params: [enabled]
  });
}
async function setMinGasPrice(client, { gasPrice }) {
  await client.request({
    method: `${client.mode}_setMinGasPrice`,
    params: [numberToHex(gasPrice)]
  });
}
async function setNextBlockBaseFeePerGas(client, { baseFeePerGas }) {
  await client.request({
    method: `${client.mode}_setNextBlockBaseFeePerGas`,
    params: [numberToHex(baseFeePerGas)]
  });
}
async function setNextBlockTimestamp(client, { timestamp }) {
  await client.request({
    method: "evm_setNextBlockTimestamp",
    params: [numberToHex(timestamp)]
  });
}
async function setNonce(client, { address, nonce }) {
  await client.request({
    method: `${client.mode}_setNonce`,
    params: [address, numberToHex(nonce)]
  });
}
async function setRpcUrl(client, jsonRpcUrl) {
  await client.request({
    method: `${client.mode}_setRpcUrl`,
    params: [jsonRpcUrl]
  });
}
async function setStorageAt(client, { address, index, value }) {
  await client.request({
    method: `${client.mode}_setStorageAt`,
    params: [
      address,
      typeof index === "number" ? numberToHex(index) : index,
      value
    ]
  });
}
async function snapshot(client) {
  return await client.request({
    method: "evm_snapshot"
  });
}
async function stopImpersonatingAccount(client, { address }) {
  await client.request({
    method: `${client.mode}_stopImpersonatingAccount`,
    params: [address]
  });
}
function testActions({ mode }) {
  return (client_) => {
    const client = client_.extend(() => ({
      mode
    }));
    return {
      dropTransaction: (args) => dropTransaction(client, args),
      dumpState: () => dumpState(client),
      getAutomine: () => getAutomine(client),
      getTxpoolContent: () => getTxpoolContent(client),
      getTxpoolStatus: () => getTxpoolStatus(client),
      impersonateAccount: (args) => impersonateAccount(client, args),
      increaseTime: (args) => increaseTime(client, args),
      inspectTxpool: () => inspectTxpool(client),
      loadState: (args) => loadState(client, args),
      mine: (args) => mine(client, args),
      removeBlockTimestampInterval: () => removeBlockTimestampInterval(client),
      reset: (args) => reset(client, args),
      revert: (args) => revert(client, args),
      sendUnsignedTransaction: (args) => sendUnsignedTransaction(client, args),
      setAutomine: (args) => setAutomine(client, args),
      setBalance: (args) => setBalance(client, args),
      setBlockGasLimit: (args) => setBlockGasLimit(client, args),
      setBlockTimestampInterval: (args) => setBlockTimestampInterval(client, args),
      setCode: (args) => setCode(client, args),
      setCoinbase: (args) => setCoinbase(client, args),
      setIntervalMining: (args) => setIntervalMining(client, args),
      setLoggingEnabled: (args) => setLoggingEnabled(client, args),
      setMinGasPrice: (args) => setMinGasPrice(client, args),
      setNextBlockBaseFeePerGas: (args) => setNextBlockBaseFeePerGas(client, args),
      setNextBlockTimestamp: (args) => setNextBlockTimestamp(client, args),
      setNonce: (args) => setNonce(client, args),
      setRpcUrl: (args) => setRpcUrl(client, args),
      setStorageAt: (args) => setStorageAt(client, args),
      snapshot: () => snapshot(client),
      stopImpersonatingAccount: (args) => stopImpersonatingAccount(client, args)
    };
  };
}
function createTestClient(parameters) {
  const { key = "test", name = "Test Client", mode } = parameters;
  const client = createClient({
    ...parameters,
    key,
    name,
    type: "testClient"
  });
  return client.extend((config) => ({
    mode,
    ...testActions({ mode })(config)
  }));
}
async function addChain(client, { chain }) {
  const { id, name, nativeCurrency, rpcUrls, blockExplorers } = chain;
  await client.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: numberToHex(id),
        chainName: name,
        nativeCurrency,
        rpcUrls: rpcUrls.default.http,
        blockExplorerUrls: blockExplorers ? Object.values(blockExplorers).map(({ url }) => url) : void 0
      }
    ]
  }, { dedupe: true, retryCount: 0 });
}
function deployContract(walletClient, parameters) {
  const { abi, args, bytecode, ...request } = parameters;
  const calldata = encodeDeployData({ abi, args, bytecode });
  return sendTransaction(walletClient, {
    ...request,
    ...request.authorizationList ? { to: null } : {},
    data: calldata
  });
}
async function getAddresses(client) {
  var _a;
  if (((_a = client.account) == null ? void 0 : _a.type) === "local")
    return [client.account.address];
  const addresses = await client.request({ method: "eth_accounts" }, { dedupe: true });
  return addresses.map((address) => checksumAddress(address));
}
async function getCapabilities(client, parameters = {}) {
  const { account = client.account, chainId } = parameters;
  const account_ = account ? parseAccount(account) : void 0;
  const params = chainId ? [account_ == null ? void 0 : account_.address, [numberToHex(chainId)]] : [account_ == null ? void 0 : account_.address];
  const capabilities_raw = await client.request({
    method: "wallet_getCapabilities",
    params
  });
  const capabilities = {};
  for (const [chainId2, capabilities_] of Object.entries(capabilities_raw)) {
    capabilities[Number(chainId2)] = {};
    for (let [key, value] of Object.entries(capabilities_)) {
      if (key === "addSubAccount")
        key = "unstable_addSubAccount";
      capabilities[Number(chainId2)][key] = value;
    }
  }
  return typeof chainId === "number" ? capabilities[chainId] : capabilities;
}
async function getPermissions(client) {
  const permissions = await client.request({ method: "wallet_getPermissions" }, { dedupe: true });
  return permissions;
}
async function requestAddresses(client) {
  const addresses = await client.request({ method: "eth_requestAccounts" }, { dedupe: true, retryCount: 0 });
  return addresses.map((address) => getAddress(address));
}
async function requestPermissions(client, permissions) {
  return client.request({
    method: "wallet_requestPermissions",
    params: [permissions]
  }, { retryCount: 0 });
}
async function sendCallsSync(client, parameters) {
  const { chain = client.chain } = parameters;
  const timeout = parameters.timeout ?? Math.max(((chain == null ? void 0 : chain.blockTime) ?? 0) * 3, 5e3);
  const result = await getAction(client, sendCalls, "sendCalls")(parameters);
  const status = await getAction(client, waitForCallsStatus, "waitForCallsStatus")({
    ...parameters,
    id: result.id,
    timeout
  });
  return status;
}
async function showCallsStatus(client, parameters) {
  const { id } = parameters;
  await client.request({
    method: "wallet_showCallsStatus",
    params: [id]
  });
  return;
}
async function signAuthorization(client, parameters) {
  const { account: account_ = client.account } = parameters;
  if (!account_)
    throw new AccountNotFoundError({
      docsPath: "/docs/eip7702/signAuthorization"
    });
  const account = parseAccount(account_);
  if (!account.signAuthorization)
    throw new AccountTypeNotSupportedError({
      docsPath: "/docs/eip7702/signAuthorization",
      metaMessages: [
        "The `signAuthorization` Action does not support JSON-RPC Accounts."
      ],
      type: account.type
    });
  const authorization = await prepareAuthorization(client, parameters);
  return account.signAuthorization(authorization);
}
async function signTransaction(client, parameters) {
  var _a, _b, _c, _d;
  const { account: account_ = client.account, chain = client.chain, ...transaction } = parameters;
  if (!account_)
    throw new AccountNotFoundError({
      docsPath: "/docs/actions/wallet/signTransaction"
    });
  const account = parseAccount(account_);
  assertRequest({
    account,
    ...parameters
  });
  const chainId = await getAction(client, getChainId, "getChainId")({});
  if (chain !== null)
    assertCurrentChain({
      currentChainId: chainId,
      chain
    });
  const formatters = (chain == null ? void 0 : chain.formatters) || ((_a = client.chain) == null ? void 0 : _a.formatters);
  const format = ((_b = formatters == null ? void 0 : formatters.transactionRequest) == null ? void 0 : _b.format) || formatTransactionRequest;
  if (account.signTransaction)
    return account.signTransaction({
      ...transaction,
      account,
      chainId
    }, { serializer: (_d = (_c = client.chain) == null ? void 0 : _c.serializers) == null ? void 0 : _d.transaction });
  return await client.request({
    method: "eth_signTransaction",
    params: [
      {
        ...format({
          ...transaction,
          account
        }, "signTransaction"),
        chainId: numberToHex(chainId),
        from: account.address
      }
    ]
  }, { retryCount: 0 });
}
async function signTypedData(client, parameters) {
  const { account: account_ = client.account, domain, message, primaryType } = parameters;
  if (!account_)
    throw new AccountNotFoundError({
      docsPath: "/docs/actions/wallet/signTypedData"
    });
  const account = parseAccount(account_);
  const types = {
    EIP712Domain: getTypesForEIP712Domain({ domain }),
    ...parameters.types
  };
  validateTypedData({ domain, message, primaryType, types });
  if (account.signTypedData)
    return account.signTypedData({ domain, message, primaryType, types });
  const typedData = serializeTypedData({ domain, message, primaryType, types });
  return client.request({
    method: "eth_signTypedData_v4",
    params: [account.address, typedData]
  }, { retryCount: 0 });
}
async function switchChain(client, { id }) {
  await client.request({
    method: "wallet_switchEthereumChain",
    params: [
      {
        chainId: numberToHex(id)
      }
    ]
  }, { retryCount: 0 });
}
async function watchAsset(client, params) {
  const added = await client.request({
    method: "wallet_watchAsset",
    params
  }, { retryCount: 0 });
  return added;
}
function walletActions(client) {
  return {
    addChain: (args) => addChain(client, args),
    deployContract: (args) => deployContract(client, args),
    fillTransaction: (args) => fillTransaction(client, args),
    getAddresses: () => getAddresses(client),
    getCallsStatus: (args) => getCallsStatus(client, args),
    getCapabilities: (args) => getCapabilities(client, args),
    getChainId: () => getChainId(client),
    getPermissions: () => getPermissions(client),
    prepareAuthorization: (args) => prepareAuthorization(client, args),
    prepareTransactionRequest: (args) => prepareTransactionRequest(client, args),
    requestAddresses: () => requestAddresses(client),
    requestPermissions: (args) => requestPermissions(client, args),
    sendCalls: (args) => sendCalls(client, args),
    sendCallsSync: (args) => sendCallsSync(client, args),
    sendRawTransaction: (args) => sendRawTransaction(client, args),
    sendRawTransactionSync: (args) => sendRawTransactionSync(client, args),
    sendTransaction: (args) => sendTransaction(client, args),
    sendTransactionSync: (args) => sendTransactionSync(client, args),
    showCallsStatus: (args) => showCallsStatus(client, args),
    signAuthorization: (args) => signAuthorization(client, args),
    signMessage: (args) => signMessage(client, args),
    signTransaction: (args) => signTransaction(client, args),
    signTypedData: (args) => signTypedData(client, args),
    switchChain: (args) => switchChain(client, args),
    waitForCallsStatus: (args) => waitForCallsStatus(client, args),
    watchAsset: (args) => watchAsset(client, args),
    writeContract: (args) => writeContract(client, args),
    writeContractSync: (args) => writeContractSync(client, args),
    token: {
      approve: bindActionDecorators(client, approve),
      approveSync: bindActionDecorators(client, approveSync),
      transfer: bindActionDecorators(client, transfer),
      transferSync: bindActionDecorators(client, transferSync)
    }
  };
}
function createWalletClient(parameters) {
  const { key = "wallet", name = "Wallet Client", transport } = parameters;
  const client = createClient({
    ...parameters,
    key,
    name,
    transport,
    type: "walletClient"
  });
  return client.extend(walletActions);
}
function fallback(transports_, config = {}) {
  const { key = "fallback", name = "Fallback", rank = false, shouldThrow: shouldThrow_ = shouldThrow, retryCount, retryDelay } = config;
  return (({ chain, pollingInterval = 4e3, timeout, ...rest }) => {
    let transports = transports_;
    let onResponse = () => {
    };
    const transport = createTransport({
      key,
      name,
      async request({ method, params }) {
        let includes;
        const fetch = async (i = 0) => {
          const transport2 = transports[i]({
            ...rest,
            chain,
            retryCount: 0,
            timeout
          });
          try {
            const response = await transport2.request({
              method,
              params
            });
            onResponse({
              method,
              params,
              response,
              transport: transport2,
              status: "success"
            });
            return response;
          } catch (err) {
            onResponse({
              error: err,
              method,
              params,
              transport: transport2,
              status: "error"
            });
            if (shouldThrow_(err))
              throw err;
            if (i === transports.length - 1)
              throw err;
            includes ?? (includes = transports.slice(i + 1).some((transport3) => {
              const { include, exclude } = transport3({ chain }).config.methods || {};
              if (include)
                return include.includes(method);
              if (exclude)
                return !exclude.includes(method);
              return true;
            }));
            if (!includes)
              throw err;
            return fetch(i + 1);
          }
        };
        return fetch();
      },
      retryCount,
      retryDelay,
      type: "fallback"
    }, {
      onResponse: (fn) => onResponse = fn,
      transports: transports.map((fn) => fn({ chain, retryCount: 0 }))
    });
    if (rank) {
      const rankOptions = typeof rank === "object" ? rank : {};
      rankTransports({
        chain,
        interval: rankOptions.interval ?? pollingInterval,
        onTransports: (transports_2) => transports = transports_2,
        ping: rankOptions.ping,
        sampleCount: rankOptions.sampleCount,
        timeout: rankOptions.timeout,
        transports,
        weights: rankOptions.weights
      });
    }
    return transport;
  });
}
function shouldThrow(error) {
  if ("code" in error && typeof error.code === "number") {
    if (error.code === TransactionRejectedRpcError.code || error.code === UserRejectedRequestError.code || error.code === WalletConnectSessionSettlementError.code || ExecutionRevertedError.nodeMessage.test(error.message) || error.code === 5e3)
      return true;
  }
  return false;
}
function rankTransports({ chain, interval = 4e3, onTransports, ping, sampleCount = 10, timeout = 1e3, transports, weights = {} }) {
  const { stability: stabilityWeight = 0.7, latency: latencyWeight = 0.3 } = weights;
  const samples = [];
  const rankTransports_ = async () => {
    const sample = await Promise.all(transports.map(async (transport) => {
      const transport_ = transport({ chain, retryCount: 0, timeout });
      const start = Date.now();
      let end;
      let success;
      try {
        await (ping ? ping({ transport: transport_ }) : transport_.request({ method: "net_listening" }));
        success = 1;
      } catch {
        success = 0;
      } finally {
        end = Date.now();
      }
      const latency = end - start;
      return { latency, success };
    }));
    samples.push(sample);
    if (samples.length > sampleCount)
      samples.shift();
    const maxLatency = Math.max(...samples.map((sample2) => Math.max(...sample2.map(({ latency }) => latency))));
    const scores = transports.map((_, i) => {
      const latencies = samples.map((sample2) => sample2[i].latency);
      const meanLatency = latencies.reduce((acc, latency) => acc + latency, 0) / latencies.length;
      const latencyScore = 1 - meanLatency / maxLatency;
      const successes = samples.map((sample2) => sample2[i].success);
      const stabilityScore = successes.reduce((acc, success) => acc + success, 0) / successes.length;
      if (stabilityScore === 0)
        return [0, i];
      return [
        latencyWeight * latencyScore + stabilityWeight * stabilityScore,
        i
      ];
    }).sort((a, b) => b[0] - a[0]);
    onTransports(scores.map(([, i]) => transports[i]));
    await wait(interval);
    rankTransports_();
  };
  rankTransports_();
}
function webSocket(url, config = {}) {
  const { keepAlive, key = "webSocket", methods, name = "WebSocket JSON-RPC", reconnect, retryDelay } = config;
  return ({ chain, retryCount: retryCount_, timeout: timeout_ }) => {
    var _a;
    const retryCount = config.retryCount ?? retryCount_;
    const timeout = timeout_ ?? config.timeout ?? 1e4;
    const url_ = url || ((_a = chain == null ? void 0 : chain.rpcUrls.default.webSocket) == null ? void 0 : _a[0]);
    const wsRpcClientOpts = { keepAlive, reconnect };
    if (!url_)
      throw new UrlRequiredError();
    return createTransport({
      key,
      methods,
      name,
      async request({ method, params }) {
        const body = { method, params };
        const rpcClient = await getWebSocketRpcClient(url_, wsRpcClientOpts);
        const { error, result } = await rpcClient.requestAsync({
          body,
          timeout
        });
        if (error)
          throw new RpcRequestError({
            body,
            error,
            url: url_
          });
        return result;
      },
      retryCount,
      retryDelay,
      timeout,
      type: "webSocket"
    }, {
      getSocket() {
        return getSocket(url_);
      },
      getRpcClient() {
        return getWebSocketRpcClient(url_, wsRpcClientOpts);
      },
      async subscribe({ params, onData, onError }) {
        const rpcClient = await getWebSocketRpcClient(url_, wsRpcClientOpts);
        const { result: subscriptionId } = await new Promise((resolve, reject) => rpcClient.request({
          body: {
            method: "eth_subscribe",
            params
          },
          onError(error) {
            reject(error);
            onError == null ? void 0 : onError(error);
            return;
          },
          onResponse(response) {
            if (response.error) {
              reject(response.error);
              onError == null ? void 0 : onError(response.error);
              return;
            }
            if (typeof response.id === "number") {
              resolve(response);
              return;
            }
            if (response.method !== "eth_subscription")
              return;
            onData(response.params);
          }
        }));
        return {
          subscriptionId,
          async unsubscribe() {
            return new Promise((resolve) => rpcClient.request({
              body: {
                method: "eth_unsubscribe",
                params: [subscriptionId]
              },
              onResponse: resolve
            }));
          }
        };
      }
    });
  };
}
class InvalidDecimalNumberError extends BaseError {
  constructor({ value }) {
    super(`Number \`${value}\` is not a valid decimal number.`, {
      name: "InvalidDecimalNumberError"
    });
  }
}
class ProviderRpcError extends Error {
  constructor(code, message) {
    super(message);
    Object.defineProperty(this, "code", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "details", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.code = code;
    this.details = message;
  }
}
const docsPath = "/docs/contract/decodeDeployData";
function decodeDeployData(parameters) {
  const { abi, bytecode, data } = parameters;
  if (data === bytecode)
    return { bytecode };
  const description = abi.find((x) => "type" in x && x.type === "constructor");
  if (!description)
    throw new AbiConstructorNotFoundError({ docsPath });
  if (!("inputs" in description))
    throw new AbiConstructorParamsNotFoundError({ docsPath });
  if (!description.inputs || description.inputs.length === 0)
    throw new AbiConstructorParamsNotFoundError({ docsPath });
  const args = decodeAbiParameters(description.inputs, `0x${data.replace(bytecode, "")}`);
  return { args, bytecode };
}
function fromBlobs(parameters) {
  const to = parameters.to ?? (typeof parameters.blobs[0] === "string" ? "hex" : "bytes");
  const blobs = typeof parameters.blobs[0] === "string" ? parameters.blobs.map((x) => hexToBytes(x)) : parameters.blobs;
  const length = blobs.reduce((length2, blob) => length2 + blob.length, 0);
  const data = createCursor(new Uint8Array(length));
  let active = true;
  for (const [index, blob] of blobs.entries()) {
    const cursor = createCursor(blob);
    const isLastBlob = index === blobs.length - 1;
    while (active && cursor.position < blob.length) {
      cursor.incrementPosition(1);
      let consume = 31;
      if (blob.length - cursor.position < 31)
        consume = blob.length - cursor.position;
      for (const _ in Array.from({ length: consume })) {
        const byte = cursor.readByte();
        const isTerminator = isLastBlob && byte === 128 && !cursor.inspectBytes(cursor.remaining).includes(128);
        if (isTerminator) {
          active = false;
          break;
        }
        data.pushByte(byte);
      }
    }
  }
  const trimmedData = data.bytes.slice(0, data.position);
  return to === "hex" ? bytesToHex(trimmedData) : trimmedData;
}
function sidecarsToVersionedHashes(parameters) {
  const { sidecars, version } = parameters;
  const to = parameters.to ?? (typeof sidecars[0].blob === "string" ? "hex" : "bytes");
  const hashes = [];
  for (const { commitment } of sidecars) {
    hashes.push(commitmentToVersionedHash({
      commitment,
      to,
      version
    }));
  }
  return hashes;
}
const SLIP44_MSB = 2147483648;
function toCoinType(chainId) {
  if (chainId === 1)
    return 60n;
  if (chainId >= SLIP44_MSB || chainId < 0)
    throw new EnsInvalidChainIdError({ chainId });
  return BigInt((2147483648 | chainId) >>> 0);
}
function defineKzg({ blobToKzgCommitment, computeBlobKzgProof }) {
  return {
    blobToKzgCommitment,
    computeBlobKzgProof
  };
}
function setupKzg(parameters, path) {
  try {
    parameters.loadTrustedSetup(path);
  } catch (e) {
    const error = e;
    if (!error.message.includes("trusted setup is already loaded"))
      throw error;
  }
  return defineKzg(parameters);
}
function compactSignatureToSignature({ r, yParityAndS }) {
  const yParityAndS_bytes = hexToBytes(yParityAndS);
  const yParity = yParityAndS_bytes[0] & 128 ? 1 : 0;
  const s = yParityAndS_bytes;
  if (yParity === 1)
    s[0] &= 127;
  return { r, s: bytesToHex(s), yParity };
}
function parseCompactSignature(signatureHex) {
  const { r, s } = secp256k1.Signature.fromCompact(signatureHex.slice(2, 130));
  return {
    r: numberToHex(r, { size: 32 }),
    yParityAndS: numberToHex(s, { size: 32 })
  };
}
async function recoverTransactionAddress(parameters) {
  const { serializedTransaction, signature: signature_ } = parameters;
  const transaction = parseTransaction(serializedTransaction);
  const signature = signature_ ?? {
    r: transaction.r,
    s: transaction.s,
    v: transaction.v,
    yParity: transaction.yParity
  };
  const serialized = serializeTransaction({
    ...transaction,
    r: void 0,
    s: void 0,
    v: void 0,
    yParity: void 0,
    sidecars: void 0
  });
  return await recoverAddress({
    hash: keccak256(serialized),
    signature
  });
}
function serializeCompactSignature({ r, yParityAndS }) {
  return `0x${new secp256k1.Signature(hexToBigInt(r), hexToBigInt(yParityAndS)).toCompactHex()}`;
}
function signatureToCompactSignature(signature) {
  const { r, s, v, yParity } = signature;
  const yParity_ = Number(yParity ?? v - 27n);
  let yParityAndS = s;
  if (yParity_ === 1) {
    const bytes = hexToBytes(s);
    bytes[0] |= 128;
    yParityAndS = bytesToHex(bytes);
  }
  return { r, yParityAndS };
}
const _esm = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AbiConstructorNotFoundError,
  AbiConstructorParamsNotFoundError,
  AbiDecodingDataSizeInvalidError,
  AbiDecodingDataSizeTooSmallError,
  AbiDecodingZeroDataError,
  AbiEncodingArrayLengthMismatchError,
  AbiEncodingBytesSizeMismatchError,
  AbiEncodingLengthMismatchError,
  AbiErrorInputsNotFoundError,
  AbiErrorNotFoundError,
  AbiErrorSignatureNotFoundError,
  AbiEventNotFoundError,
  AbiEventSignatureEmptyTopicsError,
  AbiEventSignatureNotFoundError,
  AbiFunctionNotFoundError,
  AbiFunctionOutputsNotFoundError,
  AbiFunctionSignatureNotFoundError,
  AccountStateConflictError,
  AtomicReadyWalletRejectedUpgradeError,
  AtomicityNotSupportedError,
  BaseError,
  BaseFeeScalarError,
  BlockNotFoundError,
  BundleFailedError,
  BundleTooLargeError,
  BytesSizeMismatchError,
  CallExecutionError,
  ChainDisconnectedError,
  ChainDoesNotSupportContract,
  ChainMismatchError,
  ChainNotFoundError,
  CircularReferenceError,
  ClientChainNotConfiguredError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  CounterfactualDeploymentFailedError,
  DecodeLogDataMismatch,
  DecodeLogTopicsMismatch,
  DuplicateIdError,
  EIP1193ProviderRpcError: ProviderRpcError,
  Eip1559FeesNotSupportedError,
  EnsAvatarInvalidNftUriError,
  EnsAvatarUnsupportedNamespaceError,
  EnsAvatarUriResolutionError,
  EnsInvalidChainIdError,
  EstimateGasExecutionError,
  ExecutionRevertedError,
  FeeCapTooHighError,
  FeeCapTooLowError,
  FeeConflictError,
  FilterTypeNotSupportedError,
  HttpRequestError,
  InsufficientFundsError,
  IntegerOutOfRangeError,
  InternalRpcError,
  IntrinsicGasTooHighError,
  IntrinsicGasTooLowError,
  InvalidAbiDecodingTypeError,
  InvalidAbiEncodingTypeError,
  InvalidAbiItemError,
  InvalidAbiParameterError,
  InvalidAbiParametersError,
  InvalidAbiTypeParameterError,
  InvalidAddressError,
  InvalidArrayError,
  InvalidBytesBooleanError,
  InvalidChainIdError,
  InvalidDecimalNumberError,
  InvalidDefinitionTypeError,
  InvalidDomainError,
  InvalidFunctionModifierError,
  InvalidHexBooleanError,
  InvalidHexValueError,
  InvalidInputRpcError,
  InvalidLegacyVError,
  InvalidModifierError,
  InvalidParameterError,
  InvalidParamsRpcError,
  InvalidParenthesisError,
  InvalidPrimaryTypeError,
  InvalidRequestRpcError,
  InvalidSerializableTransactionError,
  InvalidSerializedTransactionError,
  InvalidSerializedTransactionTypeError,
  InvalidSignatureError,
  InvalidStorageKeySizeError,
  InvalidStructSignatureError,
  InvalidStructTypeError,
  InvalidTypedDataTypeError,
  InvalidYParityError,
  JsonRpcVersionUnsupportedError,
  LimitExceededRpcError,
  MaxFeePerGasTooLowError,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  NonceMaxValueError,
  NonceTooHighError,
  NonceTooLowError,
  ParseRpcError,
  ProviderDisconnectedError,
  ProviderRpcError: ProviderRpcError$1,
  RawContractError,
  ResourceNotFoundRpcError,
  ResourceUnavailableRpcError,
  ResponseBodyTooLargeError,
  RlpDepthLimitExceededError,
  RlpListBoundaryExceededError,
  RlpTrailingBytesError,
  RpcError,
  RpcRequestError,
  SizeExceedsPaddingSizeError,
  SizeOverflowError,
  SliceOffsetOutOfBoundsError,
  SocketClosedError,
  SolidityProtectedKeywordError,
  StateAssignmentConflictError,
  SwitchChainError,
  TimeoutError,
  TipAboveFeeCapError,
  TransactionExecutionError,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  TransactionRejectedRpcError,
  TransactionTypeNotSupportedError,
  UnauthorizedProviderError,
  UnknownBundleIdError,
  UnknownNodeError,
  UnknownRpcError,
  UnknownSignatureError,
  UnknownTypeError,
  UnsupportedChainIdError,
  UnsupportedNonOptionalCapabilityError,
  UnsupportedPackedAbiType,
  UnsupportedProviderMethodError,
  UrlRequiredError,
  UserRejectedRequestError,
  WaitForCallsStatusTimeoutError,
  WaitForTransactionReceiptTimeoutError,
  WebSocketRequestError,
  assertCurrentChain,
  assertRequest,
  assertTransactionEIP1559,
  assertTransactionEIP2930,
  assertTransactionLegacy,
  blobsToCommitments,
  blobsToProofs,
  boolToBytes,
  boolToHex,
  bytesToBigInt,
  bytesToBool,
  bytesToHex,
  bytesToNumber,
  bytesToRlp,
  bytesToString,
  ccipFetch: ccipRequest,
  ccipReadTunnel,
  ccipRequest,
  checksumAddress,
  commitmentToVersionedHash,
  commitmentsToVersionedHashes,
  compactSignatureToHex: serializeCompactSignature,
  compactSignatureToSignature,
  concat,
  concatBytes,
  concatHex,
  createClient,
  createNonceManager,
  createPublicClient,
  createTestClient,
  createTransport,
  createWalletClient,
  custom,
  decodeAbiParameters,
  decodeDeployData,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  defineBlock,
  defineChain,
  defineKzg,
  defineTransaction,
  defineTransactionReceipt,
  defineTransactionRequest,
  deploylessCallViaBytecodeBytecode,
  deploylessCallViaFactoryBytecode,
  domainSeparator,
  encodeAbiParameters,
  encodeDeployData,
  encodeErrorResult,
  encodeEventTopics,
  encodeFunctionData,
  encodeFunctionResult,
  encodePacked,
  erc1155Abi,
  erc20Abi,
  erc20Abi_bytes32,
  erc4626Abi,
  erc6492SignatureValidatorAbi,
  erc6492SignatureValidatorByteCode,
  erc721Abi,
  ethAddress,
  etherUnits,
  extendSchema,
  extractChain,
  fallback,
  formatBlock,
  formatEther,
  formatGwei,
  formatLog,
  formatTransaction,
  formatTransactionReceipt,
  formatTransactionRequest,
  formatUnits,
  fromBlobs,
  fromBytes,
  fromHex,
  fromRlp,
  getAbiItem,
  getAddress,
  getChainContractAddress,
  getContract,
  getContractAddress,
  getContractError,
  getCreate2Address,
  getCreateAddress,
  getEventSelector: toEventSelector,
  getEventSignature: toSignature,
  getFunctionSelector: toFunctionSelector,
  getFunctionSignature: toSignature,
  getSerializedTransactionType,
  getTransactionType,
  getTypesForEIP712Domain,
  gweiUnits,
  hashDomain,
  hashMessage,
  hashStruct,
  hashTypedData,
  hexToBigInt,
  hexToBool,
  hexToBytes,
  hexToCompactSignature: parseCompactSignature,
  hexToNumber,
  hexToRlp,
  hexToSignature: parseSignature,
  hexToString,
  http,
  isAddress,
  isAddressEqual,
  isBytes,
  isErc6492Signature,
  isErc8010Signature,
  isHash,
  isHex,
  keccak256,
  labelhash,
  maxInt104,
  maxInt112,
  maxInt120,
  maxInt128,
  maxInt136,
  maxInt144,
  maxInt152,
  maxInt16,
  maxInt160,
  maxInt168,
  maxInt176,
  maxInt184,
  maxInt192,
  maxInt200,
  maxInt208,
  maxInt216,
  maxInt224,
  maxInt232,
  maxInt24,
  maxInt240,
  maxInt248,
  maxInt256,
  maxInt32,
  maxInt40,
  maxInt48,
  maxInt56,
  maxInt64,
  maxInt72,
  maxInt8,
  maxInt80,
  maxInt88,
  maxInt96,
  maxUint104,
  maxUint112,
  maxUint120,
  maxUint128,
  maxUint136,
  maxUint144,
  maxUint152,
  maxUint16,
  maxUint160,
  maxUint168,
  maxUint176,
  maxUint184,
  maxUint192,
  maxUint200,
  maxUint208,
  maxUint216,
  maxUint224,
  maxUint232,
  maxUint24,
  maxUint240,
  maxUint248,
  maxUint256,
  maxUint32,
  maxUint40,
  maxUint48,
  maxUint56,
  maxUint64,
  maxUint72,
  maxUint8,
  maxUint80,
  maxUint88,
  maxUint96,
  minInt104,
  minInt112,
  minInt120,
  minInt128,
  minInt136,
  minInt144,
  minInt152,
  minInt16,
  minInt160,
  minInt168,
  minInt176,
  minInt184,
  minInt192,
  minInt200,
  minInt208,
  minInt216,
  minInt224,
  minInt232,
  minInt24,
  minInt240,
  minInt248,
  minInt256,
  minInt32,
  minInt40,
  minInt48,
  minInt56,
  minInt64,
  minInt72,
  minInt8,
  minInt80,
  minInt88,
  minInt96,
  multicall3Abi,
  namehash,
  nonceManager,
  numberToBytes,
  numberToHex,
  offchainLookup,
  offchainLookupAbiItem,
  offchainLookupSignature,
  pad,
  padBytes,
  padHex,
  parseAbi,
  parseAbiItem,
  parseAbiParameter,
  parseAbiParameters,
  parseCompactSignature,
  parseErc6492Signature,
  parseErc8010Signature,
  parseEther,
  parseEventLogs,
  parseGwei,
  parseSignature,
  parseTransaction,
  parseUnits,
  prepareEncodeFunctionData,
  presignMessagePrefix,
  publicActions,
  recoverAddress,
  recoverMessageAddress,
  recoverPublicKey,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  ripemd160,
  rpcSchema,
  rpcTransactionType,
  serializeAccessList,
  serializeCompactSignature,
  serializeErc6492Signature,
  serializeErc8010Signature,
  serializeSignature,
  serializeTransaction,
  serializeTypedData,
  setErrorConfig,
  setupKzg,
  sha256,
  shouldThrow,
  sidecarsToVersionedHashes,
  signatureToCompactSignature,
  signatureToHex: serializeSignature,
  size,
  slice,
  sliceBytes,
  sliceHex,
  stringToBytes,
  stringToHex,
  stringify,
  testActions,
  toBlobSidecars,
  toBlobs,
  toBytes,
  toCoinType,
  toEventHash: toSignatureHash,
  toEventSelector,
  toEventSignature: toSignature,
  toFunctionHash: toSignatureHash,
  toFunctionSelector,
  toFunctionSignature: toSignature,
  toHex,
  toPrefixedMessage,
  toRlp,
  transactionType,
  trim,
  universalSignatureValidatorAbi: erc6492SignatureValidatorAbi,
  universalSignatureValidatorByteCode: erc6492SignatureValidatorByteCode,
  validateTypedData,
  verifyHash,
  verifyMessage,
  verifyTypedData,
  walletActions,
  webSocket,
  weiUnits,
  withCache,
  withRetry,
  withTimeout,
  zeroAddress,
  zeroHash
}, Symbol.toStringTag, { value: "Module" }));
export {
  _esm as _
};

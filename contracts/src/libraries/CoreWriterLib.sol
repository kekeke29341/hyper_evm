// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HyperCoreConstants} from "./HyperCoreConstants.sol";
import {ICoreWriter} from "../interfaces/ICoreWriter.sol";

/// @title CoreWriterLib — encode actions for HyperCore
library CoreWriterLib {
    function sendRawAction(bytes memory data) internal {
        ICoreWriter(HyperCoreConstants.CORE_WRITER).sendRawAction(data);
    }

    function encodeLimitOrder(bytes memory orderPayload) internal pure returns (bytes memory) {
        return abi.encodePacked(
            bytes1(HyperCoreConstants.ACTION_VERSION),
            bytes3(HyperCoreConstants.ACTION_LIMIT_ORDER),
            orderPayload
        );
    }
}

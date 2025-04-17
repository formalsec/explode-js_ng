Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeDeep = void 0;
const web3_types_1 = require("web3-types");
const web3_validator_1 = require("web3-validator");
const isIterable = (item) => typeof item === 'object' &&
    !(0, web3_validator_1.isNullish)(item) &&
    !Array.isArray(item) &&
    !(item instanceof web3_types_1.TypedArray);
// The following code is a derivative work of the code from the "LiskHQ/lisk-sdk" project,
// which is licensed under Apache version 2.
/**
 * Deep merge two objects.
 * @param destination - The destination object.
 * @param sources - An array of source objects.
 * @returns - The merged object.
 */
const mergeDeep = (destination, ...sources) => {
    const result = destination; // clone deep here
    if (!isIterable(result)) {
        return result;
    }
    for (const src of sources) {
        // eslint-disable-next-line no-restricted-syntax
        for (const key in src) {
            if (isIterable(src[key])) {
                if (!result[key]) {
                    result[key] = {};
                }
                (0, exports.mergeDeep)(result[key], src[key]);
            }
            else if (!(0, web3_validator_1.isNullish)(src[key]) && Object.hasOwnProperty.call(src, key)) {
                if (Array.isArray(src[key]) || src[key] instanceof web3_types_1.TypedArray) {
                    result[key] = src[key].slice(0);
                }
                else {
                    result[key] = src[key];
                }
            }
        }
    }
    return result;
};
exports.mergeDeep = mergeDeep;


"use strict";

/**
 * @file
 *
 * Copyright 2014-2017 FutoIn Project (https://futoin.org)
 * Copyright 2014-2017 Andrey Galkin <andrey@futoin.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Derived Key interface for planned FTN8 Master key management.
 *
 * A dummy so far.
 * @param {AdvancedCCM} ccm - reference to CCM
 * @param {integer} base_id - master key ID
 * @param {integer} sequence_id - sequence number of the derived key
 * @class
 */
class DerivedKey {
    constructor( ccm, base_id, sequence_id ) {
        this._ccm = ccm;
        this._base_id = base_id;
        this._sequence_id = sequence_id;
    }

    /**
     * Get master key ID
     * @returns {integer} Base ID
     */
    baseID() {
        return this._base_id;
    }

    /**
     * Get derived key sequence ID
     * @returns {integer} Sequence ID
     */
    sequenceID() {
        return this._sequence_id;
    }

    /**
     * Encrypt data with current derived key. Useful
     * for very senstive information.
     * @param {AsyncSteps} as - steps interface
     * @param {string|Buffer} data to encrypt
     * @returns {Buffer} encrypted data
     */
    encrypt( as, data ) {
        void data;
        as.error( 'NotImplemented', 'Derived key encryption is not supported yet' );
        return null;
    }

    /**
     * Decrypt data using current derived key
     * @param {AsyncSteps} as - steps interface
     * @param {Buffer} data to decrypt
     * @returns {Buffer} decrypted data
     */
    decrypt( as, data ) {
        void data;
        as.error( 'NotImplemented', 'Derived key decryption is not supported yet' );
        return null;
    }

    _cleanup() {
        this._ccm = null;
    }
}

module.exports = DerivedKey;

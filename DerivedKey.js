"use strict";

/**
 * Derived Key interface for planned FTN8 Master key management.
 *
 * A dummy so far.
 * @param {AdvancedCCM} ccm - reference to CCM
 * @param {integer} base_id - master key ID
 * @param {integer} sequence_id - sequence number of the derived key
 * @class
 */
var DerivedKey = function( ccm, base_id, sequence_id )
{
    this._ccm = ccm;
    this._base_id = base_id;
    this._sequence_id = sequence_id;
};

var DerivedKeyProto =
{
    _ccm : null,
    _base_id : null,
    _sequence_id : null,

    /**
     * Get master key ID
     * @returns {integer}
     */
    baseID : function()
    {
        return this._base_id;
    },

    /**
     * Get derived key sequence ID
     * @returns {integer}
     */
    sequenceID : function()
    {
        return this._sequence_id;
    },

    /**
     * Encrypt data with current derived key. Useful
     * for very senstive information.
     * @param {AsyncSteps} as
     * @param {string|Buffer} data to encrypt
     * @returns {Buffer} encrypted data
     */
    encrypt : function( as, data )
    {
        void as;
        void data;
        as.error( 'NotImplemented', 'Derived key encryption is not supported yet' );
    },

    /**
     * Decrypt data using current derived key
     * @param {AsyncSteps} as
     * @param {Buffer} data to decrypt
     * @returns {Buffer} decrypted data
     */
    decrypt : function( as, data )
    {
        void as;
        void data;
        as.error( 'NotImplemented', 'Derived key decryption is not supported yet' );
    },

    _cleanup : function()
    {
        this._ccm = null;
    }
};

DerivedKey.prototype = DerivedKeyProto;
module.exports = DerivedKey;

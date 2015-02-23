"use strict";

var DerivedKey = function( ccm, base_id, sequence_id )
{
    this._ccm = ccm;
    this._base_id = base_id;
    this._sequence_id = sequence_id;
};

var DerivedKeyProto =
{
    baseID : function()
    {
        return this._base_id;
    },

    sequenceID : function()
    {
        return this._sequence_id;
    },

    encrypt : function( as, data )
    {
        void as;
        void data;
    },

    decrypt : function( as, data )
    {
        void as;
        void data;
    }
};

DerivedKey.prototype = DerivedKeyProto;
module.exports = DerivedKey;

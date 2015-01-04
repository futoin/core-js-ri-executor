(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define([
            'futoin-asyncsteps',
            'futoin-invoker',
            'lodash'
        ], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('futoin-asyncsteps'), require('futoin-invoker'), require('lodash'));
    } else {
        this.FutoInExecutor = factory($as, FutoInInvoker, _);
    }
}(function (__external_$as, __external_FutoInInvoker, __external__) {
    var global = this, define;
    function _require(id) {
        var module = _require.cache[id];
        if (!module) {
            var exports = {};
            module = _require.cache[id] = {
                id: id,
                exports: exports
            };
            _require.modules[id].call(exports, module, exports);
        }
        return module.exports;
    }
    _require.cache = [];
    _require.modules = [
        function (module, exports) {
            (function (window) {
                'use strict';
                var futoin = window.FutoIn || {};
                if (typeof futoin.Executor === 'undefined') {
                    var executor_module = _require(2);
                    window.FutoInExecutor = executor_module;
                    futoin.Executor = executor_module;
                    window.FutoIn = futoin;
                    if (module) {
                        module.exports = executor_module;
                    }
                }
            }(window));
        },
        function (module, exports) {
            'use strict';
            var _ = _require(6);
            var invoker = _require(5);
            var FutoInError = invoker.FutoInError;
            var executor_const = {
                    OPT_VAULT: 'vault',
                    OPT_SPEC_DIRS: invoker.AdvancedCCM.OPT_SPEC_DIRS,
                    OPT_PROD_MODE: invoker.AdvancedCCM.OPT_PROD_MODE
                };
            var executor = function (ccm, opts) {
                this._ccm = ccm;
                this._ifaces = {};
                this._impls = {};
                opts = opts || {};
                var spec_dirs = opts[this.OPT_SPEC_DIRS];
                if (!(spec_dirs instanceof Array)) {
                    spec_dirs = [spec_dirs];
                }
                this._specdirs = spec_dirs;
                this._dev_checks = !opts[this.OPT_PROD_MODE];
            };
            executor.prototype = {
                _ccm: null,
                _ifaces: null,
                _impls: null,
                _specdirs: null,
                _dev_checks: false,
                ccm: function () {
                    return this._ccm;
                },
                register: function (as, ifacever, impl) {
                    var m = ifacever.match(invoker.SpecTools._ifacever_pattern);
                    if (m === null) {
                        as.error(FutoInError.InternalError, 'Invalid ifacever');
                    }
                    var iface = m[1];
                    var mjrmnr = m[4];
                    var mjr = m[5];
                    var mnr = m[6];
                    var ifaces = this._ifaces;
                    if (iface in ifaces && mjr in ifaces[iface]) {
                        as.error(FutoInError.InternalError, 'Already registered');
                    }
                    var info = {
                            iface: iface,
                            version: mjrmnr,
                            mjrver: mjr,
                            mnrver: mnr
                        };
                    invoker.SpecTools.loadIface(as, info, this._specdirs);
                    var _this = this;
                    as.add(function (as) {
                        if (!(iface in ifaces)) {
                            ifaces[iface] = {};
                            _this._impls[iface] = {};
                        }
                        ifaces[iface][mjr] = info;
                        _this._impls[iface][mjr] = impl;
                        for (var i = 0; i < info.inherits.length; ++i) {
                            var supm = info.inherits[i].match(invoker.SpecTools._ifacever_pattern);
                            var supiface = supm[1];
                            var supmjrmnr = supm[4];
                            var supmjr = supm[5];
                            var supmnr = supm[6];
                            var supinfo = {
                                    iface: supiface,
                                    version: supmjrmnr,
                                    mjrver: supmjr,
                                    mnrver: supmnr,
                                    derived: info
                                };
                            if (supiface in ifaces && supmjr in ifaces[supiface]) {
                                delete ifaces[iface][mjr];
                                as.error(FutoInError.InternalError, 'Conflict with inherited interfaces');
                            }
                            if (!(supiface in ifaces)) {
                                ifaces[supiface] = {};
                            }
                            ifaces[supiface][supmjr] = supinfo;
                        }
                    });
                },
                process: function (as) {
                    if (!('reqinfo' in as.state) || '_futoin_func_info' in as.state) {
                        as.error(FutoInError.InternalError, 'Invalid process() invocation');
                    }
                    var _this = this;
                    as.add(function (as) {
                        var reqinfo = as.state.reqinfo;
                        _this._getInfo(as, reqinfo);
                        as.add(function (as) {
                            _this._checkConstraints(as, reqinfo);
                            _this._checkParams(as, reqinfo);
                        });
                        as.add(function (as) {
                            var func = as.state._futoin_func;
                            var impl = _this._getImpl(as, reqinfo);
                            if (!(func in impl)) {
                                as.error(FutoInError.InternalError, 'Missing function implementation');
                            }
                            var result = impl[func](as, reqinfo);
                            if (result) {
                                _.extend(reqinfo.result(), result);
                            }
                        });
                        as.add(function (as, result) {
                            if (result) {
                                _.extend(reqinfo.result(), result);
                            }
                            _this._checkResult(as, reqinfo);
                            _this._signResponse(as, reqinfo);
                            _this._packResponse(as, reqinfo);
                        });
                    }, function (as, err) {
                        var reqinfo = as.state.reqinfo;
                        var error_info = as.state.error_info;
                        if (!(err in invoker.SpecTools.standard_errors) && (!as.state._futoin_func_info || !(err in as.state._futoin_func_info.throws))) {
                            _this._onNotExpected(as, err, error_info);
                            err = FutoInError.InternalError;
                            error_info = 'Not expected error';
                        }
                        var rawrsp = reqinfo.info[reqinfo.INFO_RAW_RESPONSE];
                        rawrsp.e = err;
                        delete rawrsp.r;
                        if (error_info) {
                            rawrsp.edesc = error_info;
                        }
                        _this._signResponse(as, reqinfo);
                        _this._packError(as, reqinfo);
                        as.success();
                    });
                },
                checkAccess: function (as, acd) {
                    void acd;
                    as.error(FutoInError.NotImplemented, 'Access Control is not supported yet');
                },
                initFromCache: function (as) {
                    as.error(FutoInError.NotImplemented, 'Caching is not supported yet');
                },
                cacheInit: function (as) {
                    as.error(FutoInError.NotImplemented, 'Caching is not supported yet');
                },
                _getInfo: function (as, reqinfo) {
                    var reqinfo_info = reqinfo.info;
                    var f = reqinfo_info[reqinfo.INFO_RAW_REQUEST].f;
                    if (typeof f !== 'string') {
                        as.error(FutoInError.InvalidRequest, 'Missing req.f');
                    }
                    f = f.split(':');
                    if (f.length !== 3) {
                        as.error(FutoInError.InvalidRequest, 'Invalid req.f');
                    }
                    var iface = f[0];
                    var func = f[2];
                    var v = f[1].split('.');
                    if (v.length !== 2) {
                        as.error(FutoInError.InvalidRequest, 'Invalid req.f (version)');
                    }
                    if (!(iface in this._ifaces)) {
                        as.error(FutoInError.UnknownInterface, 'Unknown Interface');
                    }
                    var vmjr = v[0];
                    var vmnr = v[1];
                    if (!(vmjr in this._ifaces[iface])) {
                        as.error(FutoInError.NotSupportedVersion, 'Different major version');
                    }
                    var iface_info = this._ifaces[iface][vmjr];
                    if (iface_info.mnrver < vmnr) {
                        as.error(FutoInError.NotSupportedVersion, 'Iface version is too old');
                    }
                    if ('derived' in iface_info) {
                        iface_info = iface_info.derived;
                    }
                    if (!(func in iface_info.funcs)) {
                        as.error(FutoInError.InvalidRequest, 'Not defined interface function');
                    }
                    var finfo = iface_info.funcs[func];
                    as.state._futoin_iface_info = iface_info;
                    as.state._futoin_func = func;
                    as.state._futoin_func_info = finfo;
                    if (finfo.rawresult) {
                        reqinfo_info[reqinfo.INFO_HAVE_RAW_RESULT] = true;
                    }
                },
                _checkConstraints: function (as, reqinfo) {
                    var reqinfo_info = reqinfo.info;
                    var constraints = as.state._futoin_iface_info.constraints;
                    if ('SecureChannel' in constraints && !reqinfo_info[reqinfo.INFO_SECURE_CHANNEL]) {
                        as.error(FutoInError.SecurityError, 'Insecure channel');
                    }
                    if (!('AllowAnonymous' in constraints) && !reqinfo_info[reqinfo.INFO_USER_INFO]) {
                        as.error(FutoInError.SecurityError, 'Anonymous not allowed');
                    }
                },
                _checkParams: function (as, reqinfo) {
                    var rawreq = reqinfo.info[reqinfo.INFO_RAW_REQUEST];
                    var finfo = as.state._futoin_func_info;
                    if (reqinfo[reqinfo.INFO_HAVE_RAW_UPLOAD] && !finfo.rawupload) {
                        as.error(FutoInError.InvalidRequest, 'Raw upload is not allowed');
                    }
                    if ('p' in rawreq) {
                        var reqparams = rawreq.p;
                        var k;
                        for (k in reqparams) {
                            if (!(k in finfo.params)) {
                                as.error(FutoInError.InvalidRequest, 'Unknown parameter');
                            }
                            invoker.SpecTools.checkParameterType(as, as.state._futoin_iface_info, as.state._futoin_func, k, reqparams[k]);
                        }
                        for (k in finfo.params) {
                            if (!(k in reqparams)) {
                                var pinfo = finfo.params[k];
                                if ('default' in pinfo) {
                                    reqparams[k] = pinfo.default;
                                } else {
                                    as.error(FutoInError.InvalidRequest, 'Missing parameter: ' + k);
                                }
                            }
                        }
                    } else if (Object.keys(finfo.params).length > 0) {
                        as.error(FutoInError.InvalidRequest, 'Missing parameter (any)');
                    }
                },
                _getImpl: function (as, reqinfo) {
                    void reqinfo;
                    var iface_info = as.state._futoin_iface_info;
                    var iname = iface_info.iface;
                    var imjr = iface_info.mjrver;
                    var impl = this._impls[iname][imjr];
                    if (typeof impl !== 'object') {
                        if (typeof impl === 'function') {
                            impl = impl(impl, this);
                        } else {
                            as.error(FutoInError.InternalError, 'Invalid implementation type');
                        }
                        if (typeof impl !== 'object') {
                            as.error(FutoInError.InternalError, 'Implementation does not implement InterfaceImplementation');
                        }
                        this._impls[iname][imjr] = impl;
                    }
                    return impl;
                },
                _checkResult: function (as, reqinfo) {
                    if (!this._dev_checks) {
                        return;
                    }
                    var rsp = reqinfo.info[reqinfo.INFO_RAW_RESPONSE];
                    var finfo = as.state._futoin_func_info;
                    if (finfo.rawresult) {
                        if (Object.keys(rsp.r).length > 0) {
                            as.error(FutoInError.InternalError, 'Raw result is expected');
                        }
                        return;
                    }
                    if (Object.keys(finfo.result).length > 0) {
                        var resvars = finfo.result;
                        var c = 0;
                        var k;
                        for (k in rsp.r) {
                            if (!(k in resvars)) {
                                as.error(FutoInError.InternalError, 'Unknown result variable \'' + k + '\'');
                            }
                            invoker.SpecTools.checkResultType(as, as.state._futoin_iface_info, as.state._futoin_func, k, rsp.r[k]);
                            ++c;
                        }
                        if (Object.keys(resvars).length !== c) {
                            as.error(FutoInError.InternalError, 'Missing result variables');
                        }
                    } else if (Object.keys(rsp.r).length > 0) {
                        as.error(FutoInError.InternalError, 'No result variables are expected');
                    }
                },
                _signResponse: function (as, reqinfo) {
                    if (!reqinfo.info[reqinfo.INFO_DERIVED_KEY]) {
                        return;
                    }
                },
                _packResponse: function (as, reqinfo) {
                    var reqinfo_info = reqinfo.info;
                    var finfo = as.state._futoin_func_info;
                    if (finfo.rawresult) {
                        reqinfo_info[reqinfo.INFO_RAW_RESPONSE] = null;
                        return;
                    }
                    if (!finfo.expect_result && reqinfo_info[reqinfo.INFO_RAW_REQUEST].forcersp !== true) {
                        reqinfo_info[reqinfo.INFO_RAW_RESPONSE] = null;
                        return;
                    }
                    reqinfo_info[reqinfo.INFO_RAW_RESPONSE] = JSON.stringify(reqinfo_info[reqinfo.INFO_RAW_RESPONSE]);
                },
                _packError: function (as, reqinfo) {
                    var reqinfo_info = reqinfo.info;
                    reqinfo_info[reqinfo.INFO_RAW_RESPONSE] = JSON.stringify(reqinfo_info[reqinfo.INFO_RAW_RESPONSE]);
                },
                _onNotExpected: function (as, err, error_info) {
                    void as;
                    void err;
                    void error_info;
                }
            };
            _.extend(executor, executor_const);
            _.extend(executor.prototype, executor_const);
            exports.Executor = executor;
            exports.ExecutorConst = executor_const;
        },
        function (module, exports) {
            'use strict';
            var isNode = _require(4);
            var _ = _require(6);
            exports.Executor = _require(1).Executor;
            var request = _require(3);
            _.extend(exports, request);
            if (isNode) {
                var hidreq = require;
                exports.NodeExecutor = hidreq('./node_executor');
            }
        },
        function (module, exports) {
            'use strict';
            var _ = _require(6);
            var performance_now = _require(7);
            var userinfo_const = {
                    INFO_FirstName: 'FirstName',
                    INFO_FullName: 'FullName',
                    INFO_DateOfBirth: 'DateOfBirth',
                    INFO_TimeOfBirth: 'TimeOfBirth',
                    INFO_ContactEmail: 'ContactEmail',
                    INFO_ContactPhone: 'ContactPhone',
                    INFO_HomeAddress: 'HomeAddress',
                    INFO_WorkAddress: 'WorkAddress',
                    INFO_Citizenship: 'Citizenship',
                    INFO_GovernmentRegID: 'GovernmentRegID',
                    INFO_AvatarURL: 'AvatarURL'
                };
            exports.UserInfo = function (ccm, local_id, global_id) {
                this._ccm = ccm;
                this._local_id = local_id;
                this._global_id = global_id;
            };
            exports.UserInfo.prototype = {
                localID: function () {
                    return this._local_id;
                },
                globalID: function () {
                    return this._global_id;
                },
                details: function (as, user_field_identifiers) {
                    as.error('NotImplemented');
                    void user_field_identifiers;
                }
            };
            _.extend(exports.UserInfo, userinfo_const);
            _.extend(exports.UserInfo.prototype, userinfo_const);
            exports.SourceAddress = function (type, host, port) {
                if (type === null) {
                    if (typeof host !== 'string') {
                        type = 'LOCAL';
                    } else if (host.match(/^([0-9]{1,3}\.){3}[0-9]{1,3}$/)) {
                        type = 'IPv4';
                    } else {
                        type = 'IPv6';
                    }
                }
                this.type = type;
                this.host = host;
                this.port = port;
            };
            exports.SourceAddress.prototype = {
                host: null,
                port: null,
                type: null,
                asString: function () {
                    if (this.type === 'LOCAL') {
                        return 'LOCAL:' + this.port;
                    } else if (this.type === 'IPv6') {
                        return 'IPv6:[' + this.host + ']:' + this.port;
                    } else {
                        return this.type + ':' + this.host + ':' + this.port;
                    }
                }
            };
            exports.DerivedKey = function (ccm, base_id, sequence_id) {
                this._ccm = ccm;
                this._base_id = base_id;
                this._sequence_id = sequence_id;
            };
            exports.DerivedKey.prototype = {
                baseID: function () {
                    return this._base_id;
                },
                sequenceID: function () {
                    return this._sequence_id;
                },
                encrypt: function (as, data) {
                    void as;
                    void data;
                },
                decrypt: function (as, data) {
                    void as;
                    void data;
                }
            };
            exports.ChannelContext = function () {
                this.state = function () {
                    return this.state;
                };
            };
            exports.ChannelContext.prototype = {
                state: null,
                type: function () {
                },
                isStateful: function () {
                },
                onInvokerAbort: function (callable, user_data) {
                    void callable;
                    void user_data;
                },
                openRawInput: function () {
                    return null;
                },
                openRawOutput: function () {
                    return null;
                }
            };
            var reqinfo_const = {
                    SL_ANONYMOUS: 'Anonymous',
                    SL_INFO: 'Info',
                    SL_SAFEOPS: 'SafeOps',
                    SL_PRIVLEGED_OPS: 'PrivilegedOps',
                    SL_EXCEPTIONAL_OPS: 'ExceptionalOps',
                    INFO_X509_CN: 'X509_CN',
                    INFO_PUBKEY: 'PUBKEY',
                    INFO_CLIENT_ADDR: 'CLIENT_ADDR',
                    INFO_SECURE_CHANNEL: 'SECURE_CHANNEL',
                    INFO_REQUEST_TIME_FLOAT: 'REQUEST_TIME_FLOAT',
                    INFO_SECURITY_LEVEL: 'SECURITY_LEVEL',
                    INFO_USER_INFO: 'USER_INFO',
                    INFO_RAW_REQUEST: 'RAW_REQUEST',
                    INFO_RAW_RESPONSE: 'RAW_RESPONSE',
                    INFO_DERIVED_KEY: 'DERIVED_KEY',
                    INFO_HAVE_RAW_UPLOAD: 'HAVE_RAW_UPLOAD',
                    INFO_HAVE_RAW_RESULT: 'HAVE_RAW_RESULT',
                    INFO_CHANNEL_CONTEXT: 'CHANNEL_CONTEXT'
                };
            exports.RequestInfo = function (executor, rawreq) {
                this._executor = executor;
                if (typeof rawreq === 'string') {
                    rawreq = JSON.parse(rawreq);
                }
                this._rawreq = rawreq;
                var rawrsp = { r: {} };
                if ('rid' in rawreq) {
                    rawrsp.rid = rawreq.rid;
                }
                this._rawrsp = rawrsp;
                var info = function () {
                    return this.info;
                };
                this.info = info;
                info[this.INFO_X509_CN] = null;
                info[this.INFO_X509_CN] = null;
                info[this.INFO_PUBKEY] = null;
                info[this.INFO_CLIENT_ADDR] = null;
                info[this.INFO_SECURE_CHANNEL] = false;
                info[this.INFO_SECURITY_LEVEL] = this.SL_ANONYMOUS;
                info[this.INFO_USER_INFO] = null;
                info[this.INFO_RAW_REQUEST] = rawreq;
                info[this.INFO_RAW_RESPONSE] = rawrsp;
                info[this.INFO_DERIVED_KEY] = null;
                info[this.INFO_HAVE_RAW_UPLOAD] = false;
                info[this.INFO_HAVE_RAW_RESULT] = false;
                info[this.INFO_CHANNEL_CONTEXT] = null;
                info[this.INFO_REQUEST_TIME_FLOAT] = performance_now();
            };
            exports.RequestInfo.prototype = {
                _executor: null,
                _rawreq: null,
                _rawrsp: null,
                _rawinp: null,
                _rawout: null,
                params: function () {
                    return this._rawreq.p;
                },
                result: function () {
                    return this._rawrsp.r;
                },
                rawInput: function () {
                    if (this.info[this.INFO_HAVE_RAW_UPLOAD] && this._rawinp === null && this.info[this.INFO_CHANNEL_CONTEXT] !== null) {
                        this._rawinp = this.info[this.INFO_CHANNEL_CONTEXT].openRawInput();
                    }
                    var rawinp = this._rawinp;
                    if (!rawinp) {
                        throw new Error('RawInputError');
                    }
                    return rawinp;
                },
                rawOutput: function () {
                    if (this.info[this.INFO_HAVE_RAW_RESULT] && this._rawout === null && this.info[this.INFO_CHANNEL_CONTEXT] !== null) {
                        this._rawout = this.info[this.INFO_CHANNEL_CONTEXT].openRawOutput();
                    }
                    var rawout = this._rawout;
                    if (!rawout) {
                        throw new Error('RawOutputError');
                    }
                    return rawout;
                },
                executor: function () {
                    return this._executor;
                }
            };
            _.extend(exports.RequestInfo, reqinfo_const);
            _.extend(exports.RequestInfo.prototype, reqinfo_const);
        },
        function (module, exports) {
            module.exports = false;
            try {
                module.exports = Object.prototype.toString.call(global.process) === '[object process]';
            } catch (e) {
            }
        },
        function (module, exports) {
            module.exports = __external_FutoInInvoker;
        },
        function (module, exports) {
            module.exports = __external__;
        },
        function (module, exports) {
            (function () {
                var getNanoSeconds, hrtime, loadTime;
                if (typeof performance !== 'undefined' && performance !== null && performance.now) {
                    module.exports = function () {
                        return performance.now();
                    };
                } else if (typeof process !== 'undefined' && process !== null && process.hrtime) {
                    module.exports = function () {
                        return (getNanoSeconds() - loadTime) / 1000000;
                    };
                    hrtime = process.hrtime;
                    getNanoSeconds = function () {
                        var hr;
                        hr = hrtime();
                        return hr[0] * 1000000000 + hr[1];
                    };
                    loadTime = getNanoSeconds();
                } else if (Date.now) {
                    module.exports = function () {
                        return Date.now() - loadTime;
                    };
                    loadTime = Date.now();
                } else {
                    module.exports = function () {
                        return new Date().getTime() - loadTime;
                    };
                    loadTime = new Date().getTime();
                }
            }.call(this));
        }
    ];
    return _require(0);
}));
//# sourceMappingURL=futoin-executor.js.map
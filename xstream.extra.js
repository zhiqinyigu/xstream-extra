(function(root, factory) {
    if (typeof webpackJsonp !== 'undefined' || typeof exports === 'object') {
        /*module.exports = */factory(require('xstream'));
    } else if (typeof define === 'function' && define.amd) {
        define(['xstream'], factory);
    } else if (typeof require === 'function') {
        require(['xstream'], factory);
    } else {
        /*root.returnExports = */factory(root.xstream);
    }
}(this, function(xstream) {
    const {NO, /* NO_IL, MemoryStream, */ Stream} = xstream;
    const extend = Object.assign;
    const slice = Array.prototype.slice;

    function noop() {}
    xstream.noop = noop;

    function isFunction(fn) {
        return typeof fn === 'function';
    }

    function parseExp(context, exp) {
        const chain = exp.map((key, i) => (i === 0 ? '' : '.') + (typeof key === 'number' ? `[${key}]` : key));

        for (let i = 0; i < chain.length; i++) {
            if (!context) return;
            context = context[chain[i]];
        }

        return context;
    }

    const _inherit = (function () {
        const create = Object.create ? function(proto, c) {
            var o = Object.create(proto);
            o.constructor = c;
            return o;
        } : function(proto, c) {
            function F() {}
            F.prototype = proto;

            var o = new F();
            o.constructor = c;

            return o;
        };

        function extendStatics(a, b) {
            for (var k in b) {
                if (b.hasOwnProperty(k)) a[k] = b[k];
            }
        }

        return function (a, _super) {
            extendStatics(a, _super);
            a._super = _super;
            a.prototype = create(_super.prototype, a);
        };
    })();

    function _try(c, t, u) {
        try {
            return c.f(t);
        }
        catch (e) {
            u._e(e);
            return NO;
        }
    }

    function packPromise(pr) {
        if (isFunction(pr.then)) {
            return Stream.fromPromise(pr);
        }

        return pr;
    }

    const Operator = (function () {
        function hookFactory(m) {
            return function(t) {
                var u = this.out,
                    k = m + 'Fn';
                if (u === NO) return;
                if (this[k] && this[k](t, u) === NO) return;
                u[m](t);
            }
        }

        function Operator(param, ins) {
            this.ins = ins;
            this.out = NO;
            this.param = param;
        }

        extend(Operator.prototype, {
            _start: function (out) {
                if (this.startFn && this.startFn(out) === NO) return;
                this.out = out;
                this.ins._add(this);
            },
            _stop: function () {
                if (this.stopFn && this.stopFn() === NO) return;
                this.ins._remove(this);
                this.out = NO;
            },

            _n: hookFactory('_n'),
            _e: hookFactory('_e'),
            _c: hookFactory('_c')
        })

        return Operator;
    }());


    /* Throttle */
    _inherit(Throttle, Operator);
    function Throttle(fn, ins) {
        Throttle._super.call(this, fn, ins);
        this.f = fn;
    }

    extend(Throttle.prototype, {
        type: 'throttle',
        stopFn: function() {
            this.throttle$ && this.throttle$._remove(this._lsn);
            this.throttle$ = this._lsn = null;
        },
        _unlock: function() {
            this.stopFn();
            this._lock = false;
        },
        _nFn: function(val, out$) {
            var self = this,
                throttle$;

            if (!self.throttle$) {
                throttle$ = _try(this, val, out$);

                if (throttle$ == NO) {
                    return NO
                } else {
                    self.throttle$ = throttle$;
                    self.throttle$._add(self._lsn = {
                        _n() {self._unlock()},
                        _e(err) {self.throttle$ = false, out$._e(err)},
                        _c() {self._unlock()}
                    });
                }
            }

            if (!self._lock) {
                out$._n(val);
                self._lock = true;
            }

            return NO;
        }
    });

    /* Debounce */
    _inherit(Debounce, Operator);
    function Debounce(fn, ins) {
        Debounce._super.call(this, fn, ins);
        this._nid = 1;
        this._cid = 1;
        this._eid = 1;
        this._prevVal = NO;
        this.f = fn;
    }

    Debounce.fnFactory = function(key) {
        return function(val, out$) {
            var self = this,
                tid = ++this[key+'id'],
                debounce$;

            function checkTid() {
                return tid === self[key+'id'];
            }

            function _action() {
                self.stopFn();
                out$[key](val);
                self._prevVal = NO;
            }

            if (key == '_n') {
                self._prevVal = val;
                self.stopFn();
                debounce$ = _try(this, val, out$);

                if (debounce$ == NO) {
                    return NO
                } else {
                    self.debounce$ = debounce$;
                    self.debounce$._add(self._lsn = {
                        _n() {checkTid() && _action()},
                        _e(err) {checkTid() && (self.debounce$ = null, out$._e(err))},
                        _c() {checkTid() && (_action(), self.debounce$ = false)}
                    });
                }
            } else {
                if (key === '_c' && self._prevVal !== NO) {
                    out$._n(self._prevVal);
                }
                _action();
            }

            return NO;
        }
    };

    extend(Debounce.prototype, {
        type: 'debounce',
        stopFn: function() {
            this.debounce$ && this.debounce$._remove(this._lsn);
            this.debounce$ = this._lsn = null;
        },
        _nFn: Debounce.fnFactory('_n'),
        _cFn: Debounce.fnFactory('_c')
    });

    /* Do */
    _inherit(Do, Operator);
    function Do(fn, ins) {
        Do._super.call(this, fn, ins);
        this.f = fn;
    }

    extend(Do.prototype, {
        type: 'do',
        _nFn: function(t, u) {
            return _try(this, t, u);
        }
    });

    /* Catch */
    _inherit(Catch, Operator);
    function Catch(fn, ins) {
        Catch._super.call(this, fn, ins);
        this.f = fn;
    }

    extend(Catch.prototype, {
        type: 'catch',
        _eFn: function(t, u) {
            _try(this, t, u);
        }
    });

    /* DelayWhen */
    _inherit(DelayWhen, Operator);
    function DelayWhen(factory, ins) {
        this.delayCount = 0;
        this.open = true;
        this.f = factory;
        DelayWhen._super.call(this, factory, ins);
    }

    extend(DelayWhen.prototype, {
        type: 'delayWhen',
        startFn() {
            this.open = true;
        },
        _nFn: function(val, out$) {
            var self = this,
                delay$ = _try(this, val, out$),
                _delayProd;

            if (delay$ == NO) {return NO}

            self.delayCount++;

            function _destory() {
                delay$ && delay$._remove(_delayProd);
                delay$ = _delayProd = null;
            }

            function _action() {
                if (delay$) {
                    out$._n(val);
                    self.delayCount--;

                    if (!self.open) {
                        self._c();
                    }
                }

                _destory();
            }

            delay$._add(_delayProd = {
                _n: _action,
                _c: _action,
                _e(err) {_destory(); out$._e(err)}
            })

            return NO;
        },
        _cFn() {
            this.open = false;
            if (this.delayCount !== 0) return NO;
        }
        // _eFn: DelayWhen.fnFactory('_e')
    });


    /* Exhaust */
    var ExhaustListener = (function() {
        function ExhaustListener(out, prod) {
            this.prod = prod;
            this.out = out;
        }

        extend(ExhaustListener.prototype, {
            _n(val) {this.out._n(val)},
            _e(err) {this.out._e(err)},
            _c() {
                this.prod.inner = NO;
                this.prod.less();
            }
        });

        return ExhaustListener;
    })();

    _inherit(Exhaust, Operator);
    function Exhaust(fn, ins) {
        this.open = true;
        this.inner = NO;
        Exhaust._super.call(this, fn, ins);
    }
    extend(Exhaust.prototype, {
        type: 'exhaust',
        startFn: function() {
            this.open = true;
            this.inner = NO;
        },
        stopFn: function() {
            this.open = false;
            this.inner = NO;
        },
        _nFn: function(s, out) {
            if (this.inner !== NO) return NO;
            (this.inner = packPromise(s))._add(new ExhaustListener(out, this));
            return NO;
        },
        less() {
            if (!this.open && this.inner === NO && this.out !== NO) {
                this.out._c();
            }
        },
        _cFn() {
            this.open = false;
            this.less();
            return NO;
        }
    });


    /* Concat */
    _inherit(ConcatAll, Operator);
    function ConcatAll(param, ins) {
        var self = this;

        ConcatAll._super.call(this, param, ins);
        this.open = true;
        this.streams = [];
        this._proxy = {
            _n(val) {
                var u = self.out;
                if (u === NO) return;
                u._n(val);
            },
            _c() {
                self.streams.shift();
                self.startNext();
            },
            _e(err) {
                self.out._e(err);
            }
        };
    }
    extend(ConcatAll.prototype, {
        type: 'concatAll',
        startNext() {
            var u = this.out,
                streams = this.streams;

            if (u === NO) return;

            if (streams.length) {
                streams[0]._add(this._proxy);
            } else if (!this.open) {
                u._c();
            }
        },
        stopFn() {
            const streams = this.streams;

            this.open = false;
            if (streams.length) {
                streams[0]._remove(this._proxy);
                streams.splice(0);
            }
        },
        startFn() {
            this.open = true;
        },
        _n(val) {
            var streams = this.streams;

            if (this.out === NO) return;
            streams.push(packPromise(val));

            if (streams.length === 1) {
                this.startNext();
            }
        },
        _c() {
            this.open = false;

            if (!this.streams.length) {
                this.startNext();
            }
        }
    });

    _inherit(Concat, ConcatAll);
    function Concat(param, ins) {
        Concat._super.call(this, param, ins);
    }
    extend(Concat.prototype, {
        type: 'concat',
        _c() {
            var u = this.out;
            var streams = this.streams;

            streams.push.apply(streams, this.param);
            this.open = false;
            this.startNext();
        },
        _n(t) {
            var u = this.out;
            if (u === NO) return;
            u._n(t);
        }
    });

    /* WithLatestFrom */
    _inherit(WithLatestFrom, Operator);
    function WithLatestFrom(stream, ins) {
        this.latestVal = NO;
        WithLatestFrom._super.call(this, stream, ins);
    }
    extend(WithLatestFrom.prototype, {
        type: 'withLatestFrom',
        startFn(out) {
            var self = this;

            this.param._add(this.prod = {
                _n(n) {
                    self.latestVal = n;
                },
                _e(err) {
                    out._e(err);
                },
                _c: noop
            })
        },
        _nFn(val, out) {
            var latestVal = this.latestVal;

            if (latestVal === NO) return NO;
            out._n([val, latestVal]);
            return NO;
        },
        _cFn() {
            this.param._remove(this.prod);
        },
        _eFn() {
            this.param._remove(this.prod);
        }
    });

    /* DistinctUntilChanged */
    _inherit(DistinctUntilChanged, Operator);
    function DistinctUntilChanged(compare, ins) {
        DistinctUntilChanged._super.call(this, compare, ins);
        this._prevVal = NO;
    }
    extend(DistinctUntilChanged.prototype, {
        type: 'distinctUntilChanged',
        _nFn(val) {
            const isSame = (this.param || this._compare)(val, this._prevVal);
            this._prevVal = val;

            return isSame && NO;
        },
        _compare(val, _prevVal) {
            return val === _prevVal;
        }
    });


    /* Cache */
    _inherit(Cache, Operator);
    function Cache(when, ins) {
        this._cache = NO;
        Cache._super.call(this, when, ins);
    }
    extend(Cache.prototype, {
        type: 'cache',
        startFn: function(out) {
            if (this._expirationTime && (this._expirationTime < Date.now())) {
                this._cache = NO;
            }

            if (this._cache !== NO) {
                out._n(this._cache);
                out._c();
                return NO;
            }
        },
        _nFn: function(val, out) {
            var when = this.param;

            if (this._cache === NO) {
                if (typeof when === 'number') {
                    this._expirationTime = Date.now() + when;
                }

                out._n(this._cache = val);
                out._c();
            }

            return NO;
        }
    });


    /* Retry */
    _inherit(Retry, Operator);
    function Retry(count, ins) {
        Retry._super.call(this, count, ins);
        this.param = count || 1;
    }
    extend(Retry.prototype, {
        type: 'retry',
        startFn() {
            var param = this.param;

            if (typeof param === 'object') {
                this.count = param[0];
                this.interval = param[1];
            } else {
                this.count = param;
                this.interval = 0;
            }
        },
        _eFn() {
            const self = this;

            if (self.count) {
                self.count--;
                setTimeout(function() {self.ins._add(self)}, self.interval);

                return NO;
            }
        }
    });


    /* BufferCount */
    _inherit(BufferCount, Operator);
    function BufferCount(param, ins) {
        BufferCount._super.call(this, param, ins);
        this.count = param[0] || 1;
        this.start = param[1] || param[0];
    }
    extend(BufferCount.prototype, {
        type: 'bufferCount',
        startFn() {
            this.buffer = [];
        },
        _nFn(n, out$) {
            var {buffer, count, start} = this;

            buffer.push(n);

            if (buffer.length === count) {
                out$._n(buffer.slice(0));
                buffer.splice(0, start);
            }

            return NO
        },
        _cFn(_, out$) {
            if (this.buffer.length) {
                out$._n(this.buffer.slice(0));
            }
        }
    });

    /* Buffer */
    _inherit(Buffer, Operator);
    function Buffer(param, ins) {
        Buffer._super.call(this, param, ins);
    }
    extend(Buffer.prototype, {
        type: 'buffer',
        startFn(out$) {
            const self = this;

            self.open = true;
            self.buffer = [];
            self.param._add(self._lsn = {
                _n() {
                    out$._n(self.buffer.splice(0));
                },
                _c() {
                    if (self.open) {
                        out$._c();
                    } else {
                        self._lsn = null;
                    }
                },
                _e(err) {
                    out$._e(err)
                }
            });
        },
        stopFn() {
            this.open = false;
            this._lsn && this.param._remove(this._lsn);
            this._lsn = null;
        },
        _nFn(n) {
            this.buffer.push(n);
            return NO
        }
    });

    /* BufferWhen */
    _inherit(BufferWhen, Operator);
    function BufferWhen(param, ins) {
        BufferWhen._super.call(this, param, ins);
    }
    extend(BufferWhen.prototype, {
        type: 'bufferWhen',
        initClosingSelector(out$) {
            const self = this;

            self._cl = self.param();
            self._cl.take(1)._add(self._lsn = {
                _n: noop,
                _c() {
                    out$._n(self.buffer.splice(0));

                    if (self.open) {
                        self._lsn = null;
                        self.initClosingSelector(out$);
                    }
                },
                _e(err) {
                    out$._e(err)
                }
            });
        },
        startFn(out$) {
            this.open = true;
            this.buffer = [];
            this.initClosingSelector(out$);
        },
        stopFn() {
            const self = this;

            self.open = false;
            self._lsn && self._cl._remove(self._lsn);
            self._lsn = null;
        },
        _nFn(n) {
            this.buffer.push(n);
            return NO
        },
        _cFn(n, out$) {
            const buffer = this.buffer;

            if (buffer.length) {
                out$._n(buffer.splice(0));
            }
        }
    });

    /* Audit */
    /* 跟Rxjs会有些细节上的不一样，慎用，甚至先别用
     * var startTime = Date.now();
     * var clicks = Rx.Observable.interval(500).take(20).do(i => console.log(i, 'audit fn', Date.now() - startTime))
     * var result = clicks.audit(ev => {
     *   const now = Date.now();
     *   return Rx.Observable.interval(2000).do(() => console.log(ev, Date.now() - now, 'do', Date.now() - startTime))
     * });
     * result.subscribe(x => {console.log(x, '----', 'cb');});
     */
    _inherit(Audit, Operator);
    function Audit(fn, ins) {
        Audit._super.call(this, fn, ins);
        this.f = fn;
    }

    extend(Audit.prototype, {
        type: 'audit',
        _bind: function(val, out$) {
            const self = this;
            const a$ = _try(self, val, out$);
            let _action;

            if (a$ == NO) {
                return NO
            } else {
                _action = function() {
                    out$._n(self.val);
                    self.stopFn();
                    self._bind(self.val, out$);
                };

                self.a$ = a$;
                self.a$._add(self._lsn = {
                    _n: _action,
                    _c: _action,
                    _e(err) {self.a$ = false;out$._e(err)}
                });
            }
        },
        stopFn: function() {
            const self = this;
            self.a$ && self.a$._remove(self._lsn);
            self.a$ = self._lsn = null;
        },
        _nFn: function(val, out$) {
            var self = this;
            self.val = val;

            if (!self.a$) {
                self._bind(val, out$);
            }

            return NO;
        }
    });


    /*SkipUntil*/
    _inherit(SkipUntil, Operator);
    function SkipUntil(stream, ins) {
        SkipUntil._super.call(this, stream, ins);
        this._lock = true;
    }
    extend(SkipUntil.prototype, {
        type: 'skipUntil',
        startFn() {
            var self = this;
            self._lock = true;

            self.param.take(1)._add({
                _n() {self._lock = false},
                _c() {self._lock = false},
                _e(err) {self._eFn(err)}
            });
        },
        _nFn() {
            if (this._lock) return NO;
        }
    });

    /*TakeWhile*/
    _inherit(TakeWhile, Operator);
    function TakeWhile(fn, ins) {
        TakeWhile._super.call(this, fn, ins);
        this.f = fn;
    }
    extend(TakeWhile.prototype, {
        type: 'takeWhile',
        _nFn: function(t, u) {
            var r = _try(this, t, u);

            if (!r) {
                u._c();
                return NO;
            } else if (r == NO) {
                return NO
            }
        }
    });

    /*Reduce*/
    _inherit(Reduce, Operator);
    function Reduce(fn, ins) {
        var self = this;

        Reduce._super.call(this, fn, ins);
        this.acc = this.param[1];
        this.f = function (t) {return self.param[0](self.acc, t);};
    }
    extend(Reduce.prototype, {
        type: 'reduce',
        startFn: function() {
            this.acc = this.param[1];
        },
        _nFn: function(t, u) {
            var r = _try(this, t, u);

            if (r != NO) {this.acc = r}

            return NO;
        },
        _cFn: function() {
            if (this.acc != NO) {
                this.out._n(this.acc)
            }
        }
    });

    /* DefaultIfEmpty */
    _inherit(DefaultIfEmpty, Operator);
    function DefaultIfEmpty(param, ins) {
        DefaultIfEmpty._super.call(this, param, ins);
    }
    extend(DefaultIfEmpty.prototype, {
        type: 'defaultIfEmpty',
        startFn: function() {
            this._prevVal = NO;
        },
        _nFn: function(n) {
            this._prevVal = n;
        },
        _cFn: function(n, out$) {
            if (this._prevVal === NO) {
                out$._n(this.param)
            }
        }
    });


    /* warpGroup */
    _inherit(warpGroup, Operator);
    function warpGroup(config, ins) {
        warpGroup._super.call(this, config, ins);
        this._wrap = [];
        this._nid = 1;
        this._cid = 1;
        this._eid = 1;
    }
    warpGroup.fnFactory = function(key) {
        return function(val, out$) {
            var self = this,
                _wrap = this._wrap,
                delay = this.param[0],
                max = this.param[1] || -1,
                tid = ++this[key+'id'];

            function checkTid() {
                return tid === self[key+'id'];
            }

            function _action() {
                _wrap.length && out$[key](_wrap.splice(0));
            }

            _wrap.push(val);
            if (key == '_n') {
                self.debounce$ && self.debounce$._remove(self._lsn);

                if (max > 0 && _wrap.length >= max) {
                    _action();
                } else {
                    self.debounce$ = delay(val);
                    self.debounce$._add(self._lsn = {
                        _n() {checkTid() && _action()},
                        _e(err) {checkTid() && (self.debounce$ = null, out$._e(err))},
                        _c() {checkTid() && (_action(), self.debounce$ = false)}
                    });
                }

            } else {
                if (key === '_c') {
                    _wrap.length && out$._n(_wrap.splice(0));
                }
                _action();
            }

            return NO;
        }
    };

    extend(warpGroup.prototype, {
        type: 'warpGroup',
        stopFn: function() {
            this.debounce$ && this.debounce$._remove(this._lsn);
            this.debounce$ = this._lsn = null;
        },
        _nFn: warpGroup.fnFactory('_n'),
        _cFn: warpGroup.fnFactory('_c')
        // ,_eFn: warpGroup.fnFactory('_e')
    });

    /* Concurrence */
    _inherit(Concurrence, Operator);
    function Concurrence(param, ins) {
        Concurrence._super.call(this, param, ins);
        this.taskCount = 0;
        this.queue = [];
        this.open = true;
        this.f = param[0];
        this.max = param[1] || Infinity;
    }

    extend(Concurrence.prototype, {
        type: 'concurrence',
        releaseOne() {
            var u = this.out;

            if (u === NO) return;

            this.taskCount--;

            if (this.taskCount < 0) {
                throw 'Concurrence taskCount have a bug!!!!'
            }

            if (this.taskCount <= 0 && !this.open) {
                u._c(/*self.lastCompleteVal*/);
            }

            if (this.queue.length) {
                this._nFn(this.queue.shift(), u);
            }
        },
        startFn() {
            this.open = true;
        },
        stopFn() {
            this.queue.splice(0);
            this.taskCount = 0;
            this.open = false;
        },
        _cFn: function() {
            if (this.taskCount > 0) {
                this.open = false;
                return NO;
            }
        },
        _nFn: function(val, out$) {
            var self = this,
                task$;

            function _action(value) {
                out$._n(value);
            }

            if (self.taskCount < self.max) {
                self.taskCount++;
                task$ = _try(this, val, out$);

                if (task$ == NO) {return NO}

                packPromise(task$)._add({
                    _n: _action,
                    _c() {/*self.lastCompleteVal = val;*/self.releaseOne();},
                    _e(err) {out$._e(err),self.releaseOne()}
                });
            } else {
                self.queue.push(val);
            }

            return NO;
        }
    });

    /*function fillArr(arr, val, len) {
        for (var i = 0; i < len; i++) arr[len] = val
        return arr;
    }*/

    function omit(obj, keys) {
        var result = {},
            key;

        for (key in obj) {
            if (keys.indexOf(key) == -1) result[key] = obj[key]
        }

        return result
    }

    const ajaxSettingKey = [
        'interceptor',
        'proxyError',
        'transformError',
        'convertErrorMessage',
        'onError',
        'retry',
        'toastAPI',
        'httpAPI',
    ];

    /*
     * extend。如无特殊说明，操作符都是返回Stream。
     */
    extend(Stream, {
        /**
         * ajax的xstream封装
         * @param  {String}        url          请求地址
         * @param  {Object}        params       请求参数
         * @param  {Object|String} [setting]    配置，只想配置method时，可以传字符串。
         *                                      建议将全局的配置写在Stream.ajaxdefaultSetting。
         * @param  {Object}        [setting.interceptor]            拦截器配置
         * @param  {Array}         [setting.interceptor.request]    针对请求发起前的拦截器，格式[function(request, next) {}, ...]
         * @param  {Array}         [setting.interceptor.response]   针对响应到达时的拦截器，格式[function(res, request) {}, ...]
         * @param  {String}        [setting.method]                 请求方式
         * @param  {Boolean}       [setting.proxyError]             是否自动处理错误(调用onError和toastAPI)。
         * @param  {Boolean}       [setting.transformError]         遇到错误时是否将错误转化为null发出
         * @param  {Function}      [setting.convertErrorMessage]    错误信息转换(翻译)逻辑，转换给toastAPI使用
         * @param  {Function}      [setting.onError]                发生错误时的回调，仅仅是一个回调
         * @param  {Function}      [setting.onHttpBefore]           发起http前的钩子函数，当前设计不会阻断http的发起
         * @param  {Function}      [setting.optionMergeStrategies]  自定义合并策略，签名(defaultSetting, setting) => Object，默认为Object.assign({}, defaultSetting, setting)
         * @param  {Number}        [setting.retry]            失败时是否重试
         * @param  {Number}        [setting.retryInterval]    重试间隔，ms
         * @param  {Function}      [setting.toastAPI]     toast接口，代理处理错误时用
         * @param  {Function}      [setting.httpAPI]      http模块。签名要求：httpAPI({url, method, params, data})
         * @param  {Boolean}       [proxyError]  setting.proxyError的快捷方式
         * @param  {Number}        [retry]       setting.retry的快捷方式
         * @return {Stream}   返回一个Stream对象
         * @example
         * Stream.ajax(url, params, setting|method, proxyError, retry);
         * Stream.ajax(url, params, setting|method, retry);
         * Stream.ajax(url, params, setting|method);
         * Stream.ajax(url, params, proxyError);
         * Stream.ajax(url, params, retry);
         */
        ajax: function(url, params, setting, proxyError, retry) {
            const defaultSetting = Stream.ajax.defaultSetting;
            let key;
            // let _setting = typeof setting === 'object' ? setting : {};
            let _setting = {};

            _setting.proxyError = proxyError;
            _setting.retry = retry;

            switch (typeof setting) {
                case 'string':
                    _setting.method = setting;
                    break;
                case 'number':
                    _setting.retry = setting;
                    break;
                case 'boolean':
                    _setting.proxyError = setting;
                    break;
            }

            if (arguments.length === 4 && typeof proxyError === 'number') {
                _setting.retry = proxyError;
            }

            // 删除undefined的字段
            for (key in _setting) {
                if (typeof _setting[key] === 'undefined') delete _setting[key];
            }

            // 合并默认设置
            Object.assign(_setting, typeof setting === 'object' ? setting : {});
            _setting = (_setting.optionMergeStrategies || defaultSetting.optionMergeStrategies)(defaultSetting, _setting, url, params);

            // 拦截器内部异步操作的实现
            let preResolve;
            let interceptorRequestFnMaxParamLength = 0;
            let prePr = new Promise(function(resolve) {
                preResolve = resolve;
            });

            function invokeAjax(options) {
                preResolve(options);
            }

            // 拦截器
            const interceptor = defaultSetting.interceptor;
            const isPost = _setting.method === 'post';
            let userRequestObj = Object.assign({url, [isPost ? 'data' : 'params']: params}, _setting);

            if (interceptor && interceptor.request) {
                userRequestObj = interceptor.request.reduce(function(result, fn) {
                    let _result = fn(result, invokeAjax);
                    interceptorRequestFnMaxParamLength = Math.max(fn.length, interceptorRequestFnMaxParamLength);

                    return typeof _result === 'object' ? _result : result;
                }, userRequestObj);
            }

            // 取出参数定义
            const {toastAPI, httpAPI, transformError, retryInterval} = _setting;
            retry = _setting.retry;

            function ajax(options) {
                /*const NO = {};
                const {url, params} = options || NO;
                const isPost = userRequestObj.method === 'post';
                let reqParams = userRequestObj.params;
                let ajaxParams;
                let ajaxSetting = null;

                if (manualParams) {
                    // @todo  这里有bug，userRequestObj.data应该是string，而params是object，可能需要借助qs模块
                    if (isPost) {
                        if(Array.isArray(userRequestObj.data)) {
                            ajaxParams = userRequestObj.data;
                        } else {
                            ajaxParams = Object.assign({}, userRequestObj.data, params || NO);
                        }
                    } else {
                        ajaxParams = Object.assign({}, reqParams);
                        ajaxParams.params = Object.assign({}, ajaxParams.params, params || NO);
                    }

                    // ajaxParams = isPost ? userRequestObj.data : reqParams;
                    ajaxSetting = userRequestObj.setting;
                } else {
                    ajaxParams = Object.assign({}, reqParams, params || NO);
                    ajaxParams = isPost ? reqParams : {params: reqParams};
                }

                return httpAPI[userRequestObj.method || 'get'](url || userRequestObj.url, ajaxParams, ajaxSetting);*/

                const NO = {};
                const {params, data} = options || NO;
                const userData = userRequestObj.data;

                userRequestObj.params = Object.assign({}, userRequestObj.params, params || NO);
                userRequestObj.data = Array.isArray(userData) ? userData : Object.assign({}, userData, data || NO);
                userRequestObj.onHttpBefore && userRequestObj.onHttpBefore(userRequestObj);

                // 删除data字段，使webKit的get请求跳过跨域预检
                return httpAPI(omit(userRequestObj, isPost ? ajaxSettingKey : ajaxSettingKey.concat(['data'])));
            }

            let task = Stream.create({
                start(prod) {
                    (interceptorRequestFnMaxParamLength > 1 ? prePr.then(ajax) : ajax()).catch(e => e).then(res => {
                        if (interceptor && interceptor.response) {
                            return interceptor.response.reduce(function(pr, fn) {
                                return pr.then(res => fn(res, userRequestObj))
                            }, Promise.resolve(res));
                        }

                        return res;
                        /*if ((res.data && +res.data.code === 1) || (checkJson && checkJson(res) === true)) {
                            return res.data;
                        }

                        return Promise.reject(res.data)*/
                    }).then(json => {
                        prod.next(json);
                        prod.complete();
                    }, err => prod.error(err))
                },
                stop() {}
            });

            task = (typeof retry === 'number' && retry) ? task.retry(retry, retryInterval) : task;

            if (_setting.proxyError) {
                return task.pardonError(err => {
                    _setting.onError(err, userRequestObj);
                    err && toastAPI && toastAPI(_setting.convertErrorMessage ? _setting.convertErrorMessage(err, userRequestObj) : (err.msg || err.message || err));
                }, !transformError)
            }

            return task;
        },

        fromEvent: function(el, event) {
            return Stream.create({
                start(prod) {
                    var n = 1;

                    this.listener = function(e) {
                        prod.next({event: e, index: n++});
                    }

                    el.addEventListener(event, this.listener);
                },
                stop() {
                    el.removeEventListener(event, this.listener);
                }
            })
        },
        Subject: function() {
            return Stream.create({
                start() {},
                stop() {}
            });
        },
        loopAnimationFrame: function() {
            return Stream.create({
                start(prod) {
                    var i = 0,
                        start = false,
                        self = this;

                    function loop() {
                        if (self._open) {
                            start && prod.next(i++);
                            requestAnimationFrame(loop)
                        }

                        if (!start) {
                            start = true;
                        }
                    }

                    self._open = true;
                    loop();
                },
                stop() {
                    this._open = false;
                }
            })
        },
        timeout(n) {
            return Stream.create({
                start(listener) {
                    this.timer = setTimeout(function() {
                        listener.next()
                        listener.complete()
                    }, n)
                },
                stop() {
                    clearTimeout(this.timer);
                }
            })
        },
        concat() {
          const args = slice.call(arguments, 0);
          // return args.reduce((output, input) => output.concat(input), arguments[0]);
          return args[0].concat.apply(args[0], args.slice(1));
        },
        fromCallback(factory) {
          return Stream.create({
            start(prod) {
              factory(function(val) {
                prod.next(val);
                prod.complete();
              });
            },
            stop() {}
          });
        }
    });

    Stream.ajax.defaultSetting = {
        method: 'get',
        retry: 1,
        retryInterval: 0,
        onError: noop,
        optionMergeStrategies(defaultSetting, setting) {
            return Object.assign({}, defaultSetting, setting);
        },
        interceptor: {
            response: [function(res) {
                if (res.data && +res.data.code === 1) {
                    return res.data;
                }

                return Promise.reject(res.data)
            }]
        }
    };

    extend(Stream.prototype, {
        flattenMap(fn) {
            return this.map(isFunction(fn) ? fn : () => fn).flatten();
        },
        /**
         * ----1-2-3--|-->
         *     cache()
         * ----1|-->
         *
         * 在接收到上游的值以后next和complete（不管什么值，只要上游next了），并缓存下该值。
         * 跟first()相似，差异在于再次订阅时，cache会立即获得缓存值（如果没有过期）。
         *
         * @param {Number} when 过期时间，获得上流数据后n毫秒后过期；
         * @improtant 警告：切勿在scroll事件使用过期时间。
         *            由于某些版本chrome(webkit)在连续触发scroll事件时，主动“优化”了定时器代码，某些情况（或设备）下scroll事件里的定时器
         *            有几率被延后若干秒，由于cache过期时会取消订阅stream，而stream.js在取消订阅的实现使用了setTimeout(fn, 0)
         * @info Blink deferred a task in order to make scrolling smoother. Your timer and network tasks should take less than 50ms to run to avoid this. Please see https://developers.google.com/web/tools/chrome-devtools/profile/evaluate-performance/rail and https://crbug.com/574343#c40 for more information.
         */
        cache(when) {
            return new Stream(new Cache(when, this))
        },

        pluck() {
          const args = arguments;
          return this.map(res => parseExp(res, slice.call(args, 0)))
        },

        toPromise() {
            var stream = this;

            return new Promise(function(resolve, reject) {
                var listener = {
                    next(res) {
                        stream.removeListener(listener);
                        resolve(res);
                    },
                    error: reject
                };

                stream.addListener(listener);
            });
        },

        // 以下是Rx的同名操作符
        throttle(fn) {
            return new Stream(new Throttle(fn, this))
        },
        throttleTime(time) {
            return new Stream(new Throttle(() => Stream.timeout(time), this))
        },
        debounce(fn) {
            return new Stream(new Debounce(fn, this))
        },
        debounceTime(time) {
            return new Stream(new Debounce(() => Stream.timeout(time), this))
        },
        // 仅仅执行fn后立即发射值，该操作符不会改变值。通常用于对外部副作用。
        do(fn) {
            return new Stream(new Do(fn, this))
        },

        // 延迟n毫秒发射
        delay(n) {
            return new Stream(new DelayWhen(() => Stream.timeout(n), this))
        },
        // 延迟的时间取决于factory(val)返回的流什么时候发射值
        delayWhen(factory) {
            return new Stream(new DelayWhen(factory, this))
        },

        partition(fn) {
            return [
                this.filter(val => fn(val)),
                this.filter(val => fn(val) === false)
            ]
        },

        reduce(fn, initVal) {
            return new Stream(new Reduce([fn, initVal], this))
        },

        exhaust() {
            return new Stream(new Exhaust(null, this))
        },
        exhaustMap(fn) {
            return this.map(isFunction(fn) ? fn : () => fn).exhaust();
        },
        concat() {
            if (!arguments.length) throw new Error('concat: no next stream');

            return new Stream(new Concat(slice.call(arguments, 0), this))
        },
        concatAll() {
            return new Stream(new ConcatAll(null, this))
        },
        concatMap(fn) {
            return this.map(isFunction(fn) ? fn : () => fn).concatAll();
        },

        merge() {
          return Stream.merge.apply(Stream, slice.call(arguments, 0).concat(this));
        },

        withLatestFrom(stream) {
            return new Stream(new WithLatestFrom(stream, this));
        },

        distinctUntilChanged(compare) {
            return new Stream(new DistinctUntilChanged(compare, this));
        },

        /**
         * ----1-2-3--X-->
         *     retry(2)
         * ----1-2-3------1-2-3------1-2-3--X-->
         */
        retry(count, interval) {
            return new Stream(new Retry([count, interval], this))
        },

        buffer(closingNotifier) {
            return new Stream(new Buffer(closingNotifier, this))
        },

        bufferCount(n, start) {
            return new Stream(new BufferCount([n, start], this))
        },

        bufferWhen(closingSelector) {
            return new Stream(new BufferWhen(closingSelector, this))
        },

        audit(fn) {
            return new Stream(new Audit(fn, this))
        },

        skipUntil(stream) {
            return new Stream(new SkipUntil(stream, this))
        },

        takeWhile(fn) {
            return new Stream(new TakeWhile(fn, this))
        },

        defaultIfEmpty(val) {
            return new Stream(new DefaultIfEmpty(val, this))
        },

        filterEmpty: function(empty=null) {
            return this.filter(val => val !== empty)
        },

        /**
         * 由于官方的replaceError不能实现onCatch效果：只执行回调，但不改变stream的错误，即对外进行副作用。
         * 所以手动实现一个。
         * 官文：And, in case that new stream also emits an error, replace will be called again to get another stream to start replicating.
         *
         * @param  {Function} fn 发生错误时的回调函数
         * @return {Stream}  返回当前流
         */
        catch(fn) {
            return new Stream(new Catch(fn, this));
        },

        /*
         * @example
         * stream$.pardonError(fn, filterEmpty)
         * stream$.pardonError(filterEmpty)
         */
        pardonError: function(fn, filterEmpty=true) {
            return this.replaceError(err => {
                if (typeof fn === 'boolean') {
                    filterEmpty = fn;
                    fn = null;
                }

                fn && fn(err);

                return filterEmpty ? Stream.of(null).filterEmpty() : Stream.of(null)
            })
        },

        /**
         * 以下操作符由业务需求衍生出来，属于实验性的功能。
         * 因为后来业务上用不上，所以特性在日后很可能会发生变化。
         */

        /**
         * 缓存一定频率的数据值，延迟发射。
         * @param  {Function|Number} time   维度一：控制时间，每次有新值的时候，都重置计时
         * @param  {Number}          [max]  维度二：控制缓存的最大数量，达到时无视延迟，立即发射
         * @return {Stream}
         */
        warpGroup(time, max) {
            var t = time;

            if (typeof time === 'number') {
                time = () => Stream.timeout(t);
            }

            return new Stream(new warpGroup([time, max], this))
        },

        /**
         * 并发限制，要求factory返回一个（子）流。
         * @param  {Function}  factory  子流的工厂函数
         * @param  {Number}    max      最大并发量，每个子流占一个计数，直到它complete。
         *                              为1时可达到类concat效果，为Infinity时可达到类merge效果
         * @return {Stream} 当上一个流complete时，如果子流的计数器为0时，立即complete，否则等到全部子流complete
         */
        concurrence(factory, max) {
            return new Stream(new Concurrence([factory, max], this))
        }
    });
}));

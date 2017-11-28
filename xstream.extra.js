(function(global) {
    const {NO, NO_IL, MemoryStream, Stream} = global.xstream;
    var extend = Object.assign;

    function noop() {}
    global.xstream.noop = noop;

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

    const Operator =  (function () {
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
    }

    extend(Throttle.prototype, {
        type: 'throttle',
        stopFn: function() {
            this.throttle$ && this.throttle$._remove(this._throttleProd);
            this.throttle$ = this._throttleProd = null;
        },
        _unlock: function() {
            this.stopFn();
            this._lock = false;
        },
        _nFn: function(val, out$) {
            var self = this;

            if (!self.throttle$) {
                self.throttle$ = self.param(val);
                self.throttle$._add(self._throttleProd = {
                    _n() {self._unlock()},
                    _e(err) {self.throttle$ = false, out$._e(err)},
                    _c() {self._unlock()}
                });
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
    }

    Debounce.fnFactory = function(key) {
        return function(val, out$) {
            var self = this,
                tid = ++this[key+'id'];

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
                self.debounce$ = self.param(val);
                self.debounce$._add(self._debounceProd = {
                    _n() {checkTid() && _action()},
                    _e(err) {checkTid() && (self.debounce$ = null, out$._e(err))},
                    _c() {checkTid() && (_action(), self.debounce$ = false)}
                });
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
            this.debounce$ && this.debounce$._remove(this._debounceProd);
            this.debounce$ = this._debounceProd = null;
        },
        _nFn: Debounce.fnFactory('_n'),
        _cFn: Debounce.fnFactory('_c')
    });

    /* Do */
    _inherit(Do, Operator);
    function Do(fn, ins) {
        Do._super.call(this, fn, ins);
    }

    extend(Do.prototype, {
        type: 'do',
        _nFn: function(val, out$) {
            try {
                this.param(val);
            } catch (e) {
                out$._e(e);
                return NO;
            }
        }
    })

    /* DelayWhen */
    _inherit(DelayWhen, Operator);
    function DelayWhen(factory, ins) {
        this.delayCount = 0;
        DelayWhen._super.call(this, factory, ins);
    }

    extend(DelayWhen.prototype, {
        type: 'delayWhen',
        _nFn: function(val, out$) {
            var self = this,
                delay$ = this.param(val),
                _delayProd;

            self.delayCount++;

            function _destory() {
                delay$ && delay$._remove(_delayProd);
                delay$ = _delayProd = null;
            }

            function _action() {
                if (delay$) {
                    out$._n(val);
                    self.delayCount--;
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
        Exhaust._super.call(this, fn, ins);
    }
    extend(Exhaust.prototype, {
        type: 'exhaust',
        startFn: function() {
            this.open = true;
            this.inner = NO;
        },
        stopFn: function() {
        },
        _nFn: function(s, out) {
            if (this.inner !== NO) return NO;
            // this.param && this.param();
            (this.inner = s)._add(new ExhaustListener(out, this));
            return NO;
        },
        less() {
            if (!this.open && this.inner === NO) {
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
    _inherit(Concat, Operator);
    function Concat(param, ins) {
        var self = this;

        Concat._super.call(this, param, ins);
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
                self._e(err);
            }
        };
    }
    extend(Concat.prototype, {
        type: 'concat',
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
            if (streams.length) {
                streams[0]._remove(this._proxy);
            }
            this.streams.splice(0);
        },
        startFn() {
            this.open = true;
        },
        _n(val) {
            var streams = this.streams;

            if (this.out === NO) return;
            streams.push(val);

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

            this.param._add({
                _n(n) {
                    self.latestVal = n;
                },
                _e(err) {
                    out.error(err);
                },
                _c: noop
            })
        },
        _nFn(val, out) {
            var latestVal = this.latestVal;

            if (latestVal === NO) return NO;
            out._n([val, latestVal]);
            return NO;
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
            if ((this.param || this._compare)(val, this._prevVal)) return NO;
            this._prevVal = val;
        },
        _compare(val, _prevVal) {
            return val === _prevVal;
        }
    });


    /* Cache */
    _inherit(Cache, Operator);
    function Cache(fn, ins) {
        this._cache = NO;
        Cache._super.call(this, fn, ins);
    }
    extend(Cache.prototype, {
        type: 'cache',
        startFn: function(out) {
            if (this._cache !== NO) {
                out._n(this._cache);
                out._c();
                return this.ins = NO;
            }
        },
        _nFn: function(val, out) {
            if (this._cache === NO) {
                out._n(this._cache = val);
                out._c();
            }
            return NO;
        }
        // ,_cFn: function() {return NO}
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
            this.count = this.param;
        },
        _eFn() {
            if (this.count) {
                this.count--;
                setTimeout(() => this.ins._add(this));

                return NO;
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
                self.debounce$ && self.debounce$._remove(self._debounceProd);

                if (max > 0 && _wrap.length >= max) {
                    _action();
                } else {
                    self.debounce$ = delay(val);
                    self.debounce$._add(self._debounceProd = {
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
            this.debounce$ && this.debounce$._remove(this._debounceProd);
            this.debounce$ = this._debounceProd = null;
        },
        _nFn: warpGroup.fnFactory('_n'),
        _cFn: warpGroup.fnFactory('_c')
        // ,_eFn: warpGroup.fnFactory('_e')
    });

    /* Concurrence */
    _inherit(Concurrence, Operator);
    function Concurrence(fn, ins) {
        Concurrence._super.call(this, fn, ins);
        this.taskCount = 0;
        this.queue = [];
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
                max = this.param[1],
                factory = this.param[0],
                task$;

            function _action(value) {
                out$._n(value);
            }

            if (self.taskCount < max) {
                self.taskCount++;
                task$ = factory(val);
                task$._add({
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



    /*
     * extend。如无特殊说明，操作符都是返回Stream。
     */
    extend(Stream.prototype, {
        flattenMap(fn) {
            return this.map(fn).flatten();
        },
        /**
         * ----1-2-3--|-->
         *     cache()
         * ----1|-->
         *
         * 在接收到上游的值以后next和complete（不管什么值，只要上游next了），并永久缓存下该值。
         * 跟first()相似，差异在于再次订阅前者时，会立即获得缓存值。
         */
        cache() {
            return new Stream(new Cache(null, this))
        },

        // 以下是Rx的同名操作符
        throttle(fn) {
            return new Stream(new Throttle(fn, this))
        },
        throttleTime(time) {
            return new Stream(new Throttle(() => Stream.periodic(time), this))
        },
        debounce(fn) {
            return new Stream(new Debounce(fn, this))
        },
        debounceTime(time) {
            return new Stream(new Debounce(() => Stream.periodic(time), this))
        },
        // 仅仅执行fn后立即发射值，该操作符不会改变值
        do(fn) {
            return new Stream(new Do(fn, this))
        },

        // 延迟n毫秒发射
        delay(n) {
            return new Stream(new DelayWhen(() => Stream.create({
                start(listener) {
                    this.timer = setTimeout(function() {
                        listener.next()
                        listener.complete()
                    }, n)
                },
                stop() {
                    clearTimeout(this.timer);
                }
            }), this))
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

        exhaust() {
            return new Stream(new Exhaust(null, this))
        },
        exhaustMap(fn) {
            return this.map(fn).exhaust();
        },
        concat() {
            return new Stream(new Concat(null, this))
        },
        concatMap(fn) {
            return this.map(fn).concat();
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
        retry(count) {
            return new Stream(new Retry(count, this))
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
                time = () => Stream.periodic(t);
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
            return new Stream(new Concurrence(arguments, this))
        }
    });
})(window);

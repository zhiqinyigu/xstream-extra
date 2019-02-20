import { Stream, noop } from 'xstream';
import Vue from 'vue';

function upperFirstChat(name) {
  return name[0].toUpperCase() + name.slice(1);
}

if (typeof wx === 'object' && !!wx.login) {
  Stream.prototype.logError = function() {
    return this
  };

  Stream.getBoundingClientRect = function(dom, isAll) {
    return Stream.create({
      start(prod) {
        wx.createSelectorQuery()[isAll ? 'selectAll' : 'select'](dom)
          .boundingClientRect()
          .exec(function(res) {
            prod.next(res[0]);
            prod.complete();
          })
      },
      stop: noop
    });
  }

  Stream.fromMpEvent = function(node, event) {
    return Stream.create({
      start(prod) {
        node['on' + upperFirstChat(event)](this.listener = function() {
          prod.next()
        });
      },
      stop() {
        node['off' + upperFirstChat(event)](this.listener);
      }
    });
  }
} else {
  Stream.getBoundingClientRect = function(dom) {
    return Stream.of(1).map(() => {
      dom = (typeof dom === 'object' ? dom : document.querySelector(dom));

      return dom ? dom.getBoundingClientRect() : null;
    })
  }

  Stream.loadImage = function(src) {
    return Stream.create({
      start(prod) {
        const img = new Image();

        img.onload = function() {
          prod.next(img);
          prod.complete();
        };

        function errHandler() {
          prod.error(null);
        }

        img.onerror = errHandler;
        img.onabort = errHandler;
        img.crossOrigin = 'Anonymous';

        img.src = src;
      },
      stop() {}
    })
  };
}

Stream.prototype.$addListener = function(vm, listeners) {
  if (!(vm instanceof Vue)) {
    throw new Error('vm不是Vue实例')
  }

  listeners = Object.assign({
    error: err => console.error(err)
  }, listeners);

  vm._stream_.push([this, listeners]);

  return this.addListener(listeners);
};

Vue.mixin({
  methods: {
    _unsubscribeObservableForInstance() {
      this._stream_ && this._stream_.forEach(res => res[0].removeListener(res[1]));
    }
  },
  beforeMount() {
    // mpvue中，页面级的beforeDestroy不会触发。
    this._unsubscribeObservableForInstance();
    this._stream_ = [];
  },
  onUnload() {
    this._unsubscribeObservableForInstance();
  },
  beforeDestroy() {
    this._unsubscribeObservableForInstance();
  }
});



// subscriptions的合并行为
Vue.config.optionMergeStrategies.subscriptions = function(to, from) {
  if (to) {
    if (from) {
      return function() {
        return Object.assign({}, to.call(this), from.call(this));
      }
    } else {
      return to;
    }
  }

  return from;
};

// subscriptions功能
function defineReactive(vm, key, val) {
  if (key in vm) {
    vm[key] = val;
  } else {
    Vue.util.defineReactive(vm, key, val);
  }
}

Vue.mixin({
  mounted() {
    const {subscriptions} = this.$options;
    const vm = this;
    let key;
    let $observables;

    if (subscriptions) {
      vm.$observables = $observables = subscriptions.call(vm) || {};

      for (key in vm.$observables) {
        (function(key) {
          defineReactive(vm, key, undefined);

          $observables[key].$addListener(vm, {
            next(val) {
              vm[key] = val;
            }
          });
        })(key)
      }
    }
  }
});

Vue.prototype.$watchAsObservable = function(expOrFn, options) {
  const vm = this;

  return Stream.create({
    start(prod) {
      this.unwatch = vm.$watch(
        expOrFn,
        function(newValue, oldValue) {
          newValue !== oldValue && prod.next({newValue, oldValue});
        },
        options
      );
    },
    stop() {
      this.unwatch();
    }
  })
};


Vue.prototype.$createDialogStream = function(key, observableOrFn) {
  const vm = this;
  let observable;

  return Stream.create({
    start(prod) {
      vm[key] = true;

      if (observableOrFn) {
        if (typeof observableOrFn === 'function') {
          observable = observableOrFn(prod);
        } else {
          observable = observableOrFn;
        }

        observable.addListener(this.listener = {
          next: val => {
            prod.next(val)
          }
        });
      } else {
        prod.next(1);
      }
    },
    stop() {
      observable.removeListener(this.listener);
      vm[key] = false;
    }
  }).endWhen(vm.$watchAsObservable(key).map(res => res.newValue).filter(val => !val));
}

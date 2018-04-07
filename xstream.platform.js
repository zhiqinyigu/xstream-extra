import axios from 'axios';
import Vue from 'vue';
import {Stream} from 'xstream';

/**
 * @example
 * Stream.ajax(url, params, method, proxyError, retry);
 * Stream.ajax(url, params, method, retry);
 * Stream.ajax(url, params, proxyError);
 * Stream.ajax(url, params, retry);
 */
Stream.ajax = function(url, params, method, proxyError=true, retry=2) {
    var task = Stream.create({
        start(prod) {
            axios[method || 'get'](url, method == 'post' ? params : {params}).then(res => {
                if (+res.data.code !== 1) {
                    return Promise.reject(res.data)
                }

                return res.data;
            }).then(json => {
                prod.next(json);
                prod.complete()
            }, err => prod.error(err))
        },
        stop() {}
    });

    if (arguments.length === 3) {
        if (typeof method === 'number') {
            retry = method;
            method = '';
        } else if (typeof method === 'boolean') {
            proxyError = method;
            method = '';
        }
    }

    if (arguments.length === 4 && typeof proxyError === 'number') {
        retry = proxyError;
        proxyError = true;
    }

    task = typeof retry === 'number' ? task.retry(retry) : task;

    return proxyError ? task.pardonError(err => err && console.error(err.msg || err)) : task;
};

/*Stream.domReady = function() {
    return Stream.from(domReadyPr);
};*/

Stream.prototype.$addListener = function(vm, listeners) {
    if (!(vm instanceof Vue)) {
        throw new Error('vm不是Vue实例')
    }

    listeners = Object.assign({error: err => console.error(err)}, listeners);

    vm._stream_.push([this, listeners]);

    return this.addListener(listeners);
};

Vue.mixin({
    created() {
        this._stream_ = []
    },
    beforeDestroy() {
        this._stream_.forEach(res => res[0].removeListener(res[1]))
    }
})
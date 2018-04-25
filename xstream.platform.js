import Vue from 'vue';
import {Stream} from 'xstream';

/**
 * ajax的xsteram封装
 * @param  {String}        url          请求地址
 * @param  {Object}        params       请求参数
 * @param  {Object|String} [setting]    配置，只想配置method时，可以传字符串。
 *                                      建议将全局的配置写在Stream.ajaxdefaultSetting。
 * @param  {String}        [setting.method]       请求方式
 * @param  {Boolean}       [setting.proxyError]   是否处理错误
 * @param  {Number}        [setting.retry]        失败时是否重试
 * @param  {Function}      [setting.checkJson]    验证json，返回true表示该请求是有效的。否则视为失败
 * @param  {Function}      [setting.toastAPI]     toast接口，代理处理错误时用
 * @param  {Function}      [setting.httpAPI]      http模块。签名要求：httpAPI[method](url, method === 'post' ? params : {params})
 * @param  {Boolean}       [proxyError]  setting.proxyError的快捷方式
 * @param  {Number}        [retry]       setting.retry的快捷方式
 * @return {Stream}   返回一个Steram对象
 * @example
 * Stream.ajax(url, params, setting|method, proxyError, retry);
 * Stream.ajax(url, params, setting|method, retry);
 * Stream.ajax(url, params, setting|method);
 * Stream.ajax(url, params, proxyError);
 * Stream.ajax(url, params, retry);
 */
Stream.ajax = function(url, params, setting, proxyError, retry) {
    let key;
    let _setting = typeof setting === 'object' ? setting : {};

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
    _setting = Object.assign({}, Stream.ajax.defaultSetting, _setting);

    // 取出参数定义
    const {toastAPI, checkJson, method, httpAPI} = _setting;
    retry = _setting.retry;

    let task = Stream.create({
        start(prod) {
            httpAPI[method || 'get'](url, method === 'post' ? params : {params}).then(res => {
                if ((res.data && +res.data.code === 1) || (checkJson && checkJson(res) === true)) {
                    return res.data;
                }

                return Promise.reject(res.data)
            }).then(json => {
                prod.next(json);
                prod.complete()
            }, err => prod.error(err))
        },
        stop() {}
    });

    task = (typeof retry === 'number' && retry) ? task.retry(retry) : task;

    return _setting.proxyError ? task.pardonError(err => err && toastAPI && toastAPI(err.msg || err)) : task;
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

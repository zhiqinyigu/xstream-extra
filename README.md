# 简介
xstream扩展，实现常用的Rxjs的操作符。主要让xstream在移动端使用得更方便，它们都是链式的。
```
Stream.create({
	start(listener) {
		this.timer = setTimeout(() => listener.next('json'), 2000);
	},
	stop() {
		clearTimeout(this.timer);
	}
})
.do(() => asd())
.retry(2)
.addListener({
	next: val => console.log(val),
	error: val => console.error(val),
	complete: () => console.log('complete')
});
```

## 扩展的操作符
### flattenMap
### cache
```
----1-2-3--|-->
    cache()
----1|-->
```
在接收到上游的值以后next和complete（不管什么值，只要上游next了），并永久缓存下该值。
跟first()相似，差异在于再次订阅前者时，会立即获得缓存值。



## RxJS5的同名操作符
### throttle
### throttleTime
### debounce
### debounceTime
### delay
### delayWhen
### exhaust
### exhaustMap
### concat
### concatMap
### partition
### do
### withLatestFrom
### distinctUntilChanged
### retry

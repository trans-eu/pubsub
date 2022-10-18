# pubsub
A topic-based publish/subscribe library.

## Table of Contents
- [Usage](#usage)
- [Methods](#methods)
- [Examples](#examples)

## Usage

```js
import createPubsub from '@trans.eu/pubsub';

const pubsub = createPubsub();
const token = pubsub.subscribe(topic, callback);
pubsub.publish(topic); // callback is invoked
pubsub.unsubscribe(token);
pubsub.publish(topic); // callback is not invoked
```

## API
| Name | Params | Returns | Description |
|---|---|---|---|
| publish | topic: String, data: any, sync: Boolean | - | Publishes an event with the given topic name. |
| subscribe | topic: String \| RegExp, callback: Function | token: Function | Invokes callback on all events published with matching topic names. Callback is called with topic and data. |
| subscribeOnce | topic: String \| RegExp, callback: Function | token: Function | Invokes callback on the first event published with a matching topic name. |
| unsubscribe | token: Function | - | Removes a subscription. |
| unsubscribeAll | topic?: String \| RegExp | - | Removes all subscriptions for matching topic names. |
| hasSubscribers | topic: String \| RegExp | Boolean | Checks if any subscription to the given topic exist. |
| isolate | - | instance: Object | Creates an isolated scope for publishing events and topic subscription. |

## Examples

### publish
```js
// publish an event with the topic name 'test'
pubsub.publish('test');

// publish an event with the topic name 'test' and data (asynchronous)
pubsub.publish('test', 'data');

// publish an event with the topic name 'test' and data (synchronous)
pubsub.publish('test', 'data', true);
```

### subscribe
```js
// invoke callback on events published with the topic name 'test'
pubsub.subscribe('test', (topic, data) => {});

// invoke callback on events published with topic names that match the /^test.*/ RegExp pattern
pubsub.subscribe(/^test.*/, (topic, data) => {});
```

### subscribeOnce
```js
// invoke callback on the first event published with the topic name 'test'
pubsub.subscribeOnce('test', (topic, data) => {});

// invoke callback on the first event published with a topic name that matches the /^test.*/ RegExp pattern
pubsub.subscribeOnce(/^test.*/, (topic, data) => {});
```

### unsubscribe
```js
// remove a subscription to events published with the topic name 'test'
const token = pubsub.subscribe('test', (topic, data) => {});
pubsub.unsubscribe(token);
```

### unsubscribeAll
```js
// remove all subscriptions to events published with the topic name 'test'
pubsub.unsubscribeAll('test');

// remove all subscriptions to events published with topic names that match the /^test.*/ RegExp pattern
pubsub.unsubscribeAll(/test.*/);

// remove all subscriptions
pubsub.unsubscribeAll();
```

### isolate
```js
// create a pubsub instance
const pubsub = createPubsub();

// create an isolated pubsub scope 'scope_1'
const scope_1 = pubsub.isolate();

// create an isolated pubsub scope 'scope_2'
const scope_2 = pubsub.isolate();

// subscribe to events published with the topic name 'test'
pubsub.subscribe('test', (topic, data) => console.log('global'));

// subscribe to events published with the topic name 'test' within 'scope_1'
scope_1.subscribe('test', (topic, data) => console.log('scope_1'));

// subscribe to events published with the topic name 'test' within 'scope_2'
scope_2.subscribe('test', (topic, data) => console.log('scope_2'));

// publish events
pubsub.publish('test'); // global
scope_1.publish('test'); // global, scope_1
scope_2.publish('test'); // global, scope_2

// remove subscriptions to events with the topic name 'test' only on scope_1
scope_1.unsubscribeAll('test');
pubsub.publish('test'); // global
scope_1.publish('test'); // global
scope_2.publish('test'); // global, scope_2

// remove subscriptions to events with the topic name 'test' on all scopes
pubsub.unsubscribeAll('test');
```

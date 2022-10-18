const isString = (str) => typeof str === 'string';

const isFunction = (fun) => typeof fun === 'function';

const isRegExp = (regexp) => !!regexp && Object.prototype.toString.call(regexp) === '[object RegExp]';

const getOrCreateMapElement = (map, key, factory) => {
    let elem = map.get(key);

    if (!elem) {
        elem = factory();
        map.set(key, elem);
    }

    return elem;
};

const escapeRegexpCharacters = (eventName) => eventName.replace(/[-\\/\\^$+?.()|[\]{}\\*]/g, '\\$&');

const createSubscriptionKey = (eventName) => isRegExp(eventName) ? eventName.toString() : escapeRegexpCharacters(eventName);

const createSubscriptionPattern = (eventName) => isRegExp(eventName) ? eventName : new RegExp(`^${escapeRegexpCharacters(eventName)}$`);

const isValidEventName = (eventName) => isString(eventName) || isRegExp(eventName);

export default function pubsubFactory() {
    // Main subscription store.
    // Used to find callbacks when publishing events.
    //
    // Map<SubscriptionKey:String, SubscriptionObject>
    //
    // SubscriptionObject:{
    //      subscriptionPattern: RegExp,
    //      callbacks: Map<SubscriptionToken, Callback>
    // }
    //
    // add(key, pattern, token, callback): Store subscription.
    // has(key): Does subscription exist.
    // delete(key, token): Remove callback for given subscription token from given subscription.
    // forEach(...): Iterates over subscriptions.
    // size: Returns number of subscribers.
    const subscriptions = (() => {
        const store = new Map();

        return {
            get: (subscriptionKey) => store.get(subscriptionKey),

            add: (subscriptionKey, subscriptionPattern, subscriptionToken, callback) => {
                const subscription = getOrCreateMapElement(
                    store,
                    subscriptionKey,
                    () => ({
                        subscriptionPattern,
                        callbacks: new Map(),
                    })
                );

                subscription.callbacks.set(subscriptionToken, callback);
            },

            has: (subscriptionKey) => store.has(subscriptionKey),

            delete: (subscriptionKey, subscriptionToken) => {
                const subscription = store.get(subscriptionKey);

                if (subscription) {
                    subscription.callbacks.delete(subscriptionToken);
                    if (!subscription.callbacks.size) {
                        store.delete(subscriptionKey);
                    }
                }
            },

            forEach: (...args) => store.forEach(...args),

            size: () => store.size,
        };
    })();

    // A set of all subscription tokens.
    // Purely for optimization reasons.
    // Used to check if token/function used to un-subscribe is really a subscription token.
    const subscriptionTokens = new Set();

    // A reverse matching of a callback to a set of subscription tokens.
    // Used while un-subscribing to get all subscription tokens for a given callback.
    //
    // Map<Callback, Map<SubscriptionKey, Set<SubscriptionToken>>>
    //
    // add(callback, key, token): Adds a subscription token for callback.
    // delete(callback, key, token): Removes a subscription token for callback.
    // has(callback): Checks if callback exists.
    // get(callback): Returns a Map of callback subscriptions and subscription tokens.
    const callbackSubscriptionTokens = (() => {
        const store = new Map();

        return {
            add: (callback, subscriptionKey, subscriptionToken) => {
                const callbackSubscriptions = getOrCreateMapElement(
                    store,
                    callback,
                    () => new Map()
                );
                const callbackTokens = getOrCreateMapElement(
                    callbackSubscriptions,
                    subscriptionKey,
                    () => new Set()
                );
                callbackTokens.add(subscriptionToken);
            },

            delete: (callback, subscriptionKey, subscriptionToken) => {
                const callbackSubscriptions = store.get(callback);

                if (callbackSubscriptions) {
                    const callbackTokens = callbackSubscriptions.get(subscriptionKey);

                    if (callbackTokens) {
                        callbackTokens.delete(subscriptionToken);

                        if (!callbackTokens.size) {
                            callbackSubscriptions.delete(subscriptionKey);
                        }
                    }

                    if (!callbackSubscriptions.size) {
                        store.delete(callback);
                    }
                }
            },

            has: (callback) => store.has(callback),

            get: (callback) => store.get(callback),
        };
    })();

    // Collection of subscription tokens for given scope.
    // Used while un-subscribing isolated PubSub instance.
    //
    // Map<Scope:Any, Set<SubscriptionToken>>
    //
    // get(scope): Returns a Set of subscription tokens for given scope.
    // add(scope, token): Adds a subscription token with given scope.
    // delete(scope, token): Removes a subscription token from given scope.
    const scopeSubscriptionTokens = (() => {
        const store = new Map();

        return {
            get: (scope) => store.get(scope),

            add: (scope, subscriptionToken) => {
                const tokens = getOrCreateMapElement(
                    store,
                    scope,
                    () => new Set()
                );

                tokens.add(subscriptionToken);
            },

            delete: (scope, subscriptionToken) => {
                const tokens = store.get(scope);

                if (tokens) {
                    tokens.delete(subscriptionToken);

                    if (!tokens.size) {
                        store.delete(tokens);
                    }
                }
            },
        };
    })();

    const createSubscriptionToken = (scope, subscriptionKey, callback) => {
        // Token is used to un-subscribe.
        //
        // It is also a function, so it can be passed to unsubscribe() function
        // or invoked to un-subscribe.

        const token = () => {
            if (!subscriptions.has(subscriptionKey)) { return false; }

            subscriptions.delete(subscriptionKey, token);

            subscriptionTokens.delete(token);

            callbackSubscriptionTokens.delete(callback, subscriptionKey, token);

            scopeSubscriptionTokens.delete(scope, token);

            return true;
        };

        return token;
    };

    const getCallbacksForEventName = (eventName) => {
        const matchingCallbacks = [];

        subscriptions.forEach(({ subscriptionPattern, callbacks }) => {
            if (eventName.match(subscriptionPattern)) {
                matchingCallbacks.push(...callbacks.values());
            }
        });

        return matchingCallbacks;
    };

    const createDeliveryFunction = (callbacks, eventName, data) => () => {
        callbacks.forEach((callback) => {
            try {
                callback(eventName, data);
            } catch (e) { /* Continue regardless of error */ }
        });
    };

    const publish = (eventName, data, sync = false) => {
        const callbacks = getCallbacksForEventName(eventName);

        if (!callbacks.length) { return false; }

        const deliveryFunction = createDeliveryFunction(callbacks, eventName, data);

        if (sync) {
            deliveryFunction();
        } else {
            setTimeout(deliveryFunction, 0);
        }

        return true;
    };

    // 'eventName' can be a string or a RegExp that will match event names.
    const subscribe = (scope, eventName, callback) => {
        if (!isFunction(callback) || !isValidEventName(eventName)) { return null; }

        const subscriptionKey = createSubscriptionKey(eventName);
        const subscriptionPattern = createSubscriptionPattern(eventName);
        const subscriptionToken = createSubscriptionToken(scope, subscriptionKey, callback);

        subscriptions.add(subscriptionKey, subscriptionPattern, subscriptionToken, callback);

        subscriptionTokens.add(subscriptionToken);

        callbackSubscriptionTokens.add(callback, subscriptionKey, subscriptionToken);

        scopeSubscriptionTokens.add(scope, subscriptionToken);

        return subscriptionToken;
    };

    // Checks if there are subscriptions that will match an event.
    // Not passing an argument will check if there are any subscribers to any event,
    // an optimization for hasSubscribers('*').
    const hasSubscribers = (eventName) => {
        if (eventName !== undefined) {
            return !!getCallbacksForEventName(eventName).length;
        }

        return !!subscriptions.size();
    };

    // Un-subscribing can be done in 3 ways:
    // 1 - Passing a subscription token will remove an associated callback.
    // 2 - Passing a callback will remove it from all subscriptions
    // 3 - Passing an event name or RegExp and a callback will remove this specific callback
    //      from matching subscription
    const unsubscribe = (eventName, callback) => {
        // Collect all subscription tokens and invoke them all at once.
        const currentTokens = [];

        if (isFunction(eventName)) {
            if (subscriptionTokens.has(eventName)) {
                // Un-subscribing using a subscription token (1).

                currentTokens.push(eventName);
            } else if (callbackSubscriptionTokens.has(eventName)) {
                // Un-subscribing using a callback (2).

                const callbackSubscriptions = callbackSubscriptionTokens.get(eventName);

                callbackSubscriptions.forEach((callbackTokens) => {
                    currentTokens
                        .push(...callbackTokens.values());
                });
            }
        } else if (isValidEventName(eventName) && callbackSubscriptionTokens.has(callback)) {
            // Un-subscribing using a and event name and callback (3).

            const subscriptionKey = createSubscriptionKey(eventName);
            const callbackSubscriptions = callbackSubscriptionTokens.get(callback);

            if (callbackSubscriptions.has(subscriptionKey)) {
                const callbackTokens = callbackSubscriptions.get(subscriptionKey);

                currentTokens
                    .push(...callbackTokens.values());
            }
        }

        // Return true if any of the subscription tokens return true
        return currentTokens
            .reduce((result, token) => token() || result, false);
    };

    // Un-subscribe all callbacks for given event name (or RegExp)
    // Calling unsubscribeAll() with no parameters will remove all subscriptions.
    const unsubscribeAll = (scope, eventName) => {
        // Collect all subscription tokens and invoke them all at once.
        let currentTokens = [];

        if (!eventName) {
            // Un-subscribe all

            currentTokens.push(...(scope
                ? scopeSubscriptionTokens.get(scope).values()
                : subscriptionTokens.values()
            ));
        } else {
            // Un-subscribe all associated with event name

            const subscriptionKey = createSubscriptionKey(eventName);

            if (subscriptions.has(subscriptionKey)) {
                const { callbacks } = subscriptions.get(subscriptionKey);

                currentTokens.push(...callbacks.keys());

                if (scope) {
                    const scopeTokens = scopeSubscriptionTokens.get(scope);

                    if (scopeTokens) {
                        // Filter subscription tokens associated with given scope
                        currentTokens = currentTokens.filter((token) => scopeTokens.has(token));
                    } else {
                        // Scope has no subscriptions
                        currentTokens = [];
                    }
                }
            }
        }

        // Return true if any of the unsubscription functions return true
        return currentTokens
            .reduce((result, token) => token() || result, false);
    };

    const subscribeOnce = (scope, eventName, callback) => {
        if (!isFunction(callback)) { return null; }

        const subscriptionToken = subscribe(scope, eventName, (...args) => {
            unsubscribe(subscriptionToken);
            callback(...args);
        });

        return subscriptionToken;
    };

    const isolate = () => {
        const scope = Symbol('Isolated');

        return {
            subscribe: (eventName, callback) => subscribe(scope, eventName, callback),
            subscribeOnce: (eventName, callback) => subscribeOnce(scope, eventName, callback),
            hasSubscribers,
            publish,
            unsubscribe,
            unsubscribeAll: (eventName) => unsubscribeAll(scope, eventName),
        };
    };

    return {
        subscribe: (eventName, callback) => subscribe(undefined, eventName, callback),
        subscribeOnce: (eventName, callback) => subscribeOnce(undefined, eventName, callback),
        hasSubscribers,
        publish,
        unsubscribe,
        unsubscribeAll: (eventName) => unsubscribeAll(undefined, eventName),
        isolate,
    };
}

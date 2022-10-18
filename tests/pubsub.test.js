import pubsubFactory from '../index';
import 'regenerator-runtime/runtime';

describe('pubsub', () => {
    const noop = () => { };

    it('should expose a factory function', () => {
        expect(pubsubFactory).toEqual(expect.any(Function));
    });

    describe('instance', () => {
        let pubsub;

        beforeEach(() => {
            pubsub = pubsubFactory();
        });

        it('should expose specified interface', () => {
            expect(pubsub).toEqual({
                subscribe: expect.any(Function),
                subscribeOnce: expect.any(Function),
                hasSubscribers: expect.any(Function),
                publish: expect.any(Function),
                unsubscribe: expect.any(Function),
                unsubscribeAll: expect.any(Function),
                isolate: expect.any(Function),
            });
        });

        describe('subscribing', () => {
            it('should return null if event name or callback function not provided', () => {
                expect(pubsub.subscribe()).toEqual(null);
                expect(pubsub.subscribe('test')).toEqual(null);
                expect(pubsub.subscribe(undefined, noop)).toEqual(null);
            });

            it('should allow subscribing with an async or generator functions', () => {
                async function asyncFunction() { return Promise.resolve(true); }
                function* generatorFunction() { yield true; }

                expect(pubsub.subscribe('test', asyncFunction)).not.toEqual(null);
                expect(pubsub.subscribe('test', generatorFunction)).not.toEqual(null);
            });

            it('should return a subscription token', () => {
                const token = pubsub.subscribe('test', noop);

                expect(token).toEqual(expect.any(Function));
            });

            it('should return different subscription token for each callback', () => {
                const token1 = pubsub.subscribe('test', noop);
                const token2 = pubsub.subscribe('test', () => { });

                expect(token1).not.toEqual(token2);
            });

            it('should return different subscription token when subscribing to an event with the same callback', () => {
                const token1 = pubsub.subscribe('test', noop);
                const token2 = pubsub.subscribe('test', noop);

                expect(token1).not.toEqual(token2);
            });

            it('should allow checking if there are any subscribers', () => {
                const token = pubsub.subscribe('test', () => { });

                expect(pubsub.hasSubscribers()).toEqual(true);

                pubsub.unsubscribe(token);

                expect(pubsub.hasSubscribers()).toEqual(false);
            });

            it('should allow checking if there are subscribers listening to a specified event', () => {
                pubsub.subscribe('test', () => { });

                expect(pubsub.hasSubscribers('test')).toEqual(true);
                expect(pubsub.hasSubscribers('dummy-event')).toEqual(false);
            });

            it('should allow subscribing to an event based on an event name or a RegExp pattern', () => {
                pubsub.subscribe('part1.part2', () => { });

                expect(pubsub.hasSubscribers('part1.part2')).toEqual(true);

                pubsub.subscribe(/part3.*/, () => { });

                expect(pubsub.hasSubscribers('part3.part4')).toEqual(true);
            });

            it('should escape RegExp characters when subscribing to an event name to allow for an exact event matching', () => {
                pubsub.subscribe('^part1.*', () => { });

                expect(pubsub.hasSubscribers('^part1.*')).toEqual(true);
                expect(pubsub.hasSubscribers('part1.part2')).toEqual(false);
            });
        });

        describe('publishing', () => {
            it('should return false if no subscribers listening to given event', () => {
                expect(pubsub.publish('test')).toEqual(false);
            });

            it('should allow publishing an event with a specified payload asynchronously', () => {
                const callback = jest.fn();
                const payload = {};

                jest.useFakeTimers();

                pubsub.subscribe('test', callback);
                pubsub.publish('test', payload);

                expect(callback).not.toHaveBeenCalled();

                jest.runAllTimers();

                expect(callback).toHaveBeenCalledWith('test', payload);
            });

            it('should allow publishing an event with a specified payload synchronously', () => {
                const callback = jest.fn();
                const payload = {};

                pubsub.subscribe('test', callback);
                pubsub.publish('test', payload, true);

                expect(callback).toHaveBeenCalledWith('test', payload);
            });

            it('should allow publishing an event to multiple subscribers', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn();
                const payload = {};

                jest.useFakeTimers();

                pubsub.subscribe('test', callback1);
                pubsub.subscribe('test', callback2);
                pubsub.publish('test', payload);

                jest.runAllTimers();

                expect(callback1).toHaveBeenCalledWith('test', payload);
                expect(callback2).toHaveBeenCalledWith('test', payload);
            });

            it('should publish to all subscribers when a callback throws an error', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn().mockImplementation(() => {
                    throw new Error();
                });
                const callback3 = jest.fn();
                const payload = {};

                pubsub.subscribe('test', callback1);
                pubsub.subscribe('test', callback2);
                pubsub.subscribe('test', callback3);

                pubsub.publish('test', payload, true);

                expect(callback1).toHaveBeenCalled();
                expect(callback2).toThrowError();
                expect(callback3).toHaveBeenCalled();
            });
        });

        describe('subscribing once', () => {
            it('should return null if event name or callback function not provided', () => {
                expect(pubsub.subscribeOnce()).toEqual(null);
                expect(pubsub.subscribeOnce('test')).toEqual(null);
                expect(pubsub.subscribeOnce(undefined, noop)).toEqual(null);
            });

            it('should return an subscription token', () => {
                const token = pubsub.subscribeOnce('test', noop);

                expect(token).toEqual(expect.any(Function));
            });

            it('should invoke a subscription callback when the event is published for the first time', () => {
                const callback = jest.fn();
                const payload = {};

                jest.useFakeTimers();

                pubsub.subscribeOnce('test', callback);
                pubsub.publish('test', payload);

                jest.runAllTimers();

                expect(callback).toHaveBeenCalledWith('test', payload);
            });

            it('should not invoke a subscription callback on subsequent event publications', () => {
                const callback = jest.fn();
                const payload = {};

                jest.useFakeTimers();

                pubsub.subscribeOnce('test', callback);

                pubsub.publish('test', payload);
                jest.runAllTimers();

                expect(callback).toHaveBeenCalledWith('test', payload);
                callback.mockReset();

                pubsub.publish('test', payload);
                jest.runAllTimers();

                expect(callback).not.toHaveBeenCalled();
            });
        });

        describe('RegExp event subscriptions', () => {
            const eventPatterns = new Map();

            eventPatterns.set(/.*/, {
                '': true,
                part1: true,
            });

            eventPatterns.set(/.+/, {
                '': false,
                part1: true,
            });

            eventPatterns.set(/part1.part2/, {
                'part1.part2': true,
                'part1*part2': true,
            });

            eventPatterns.set(/^part1.*/, {
                part: false,
                part1: true,
                'part1.part2': true,
                'part1.part2.part3': true,
                'part1.part2.part3.part4': true,
                'prefix.part1': false,
            });

            eventPatterns.set(/.*\.part3$/, {
                part1: false,
                part3: false,
                '.part3': true,
                'part1.part2': false,
                'part1.part2.part3': true,
                'part1.part2part3': false,
                'part1.part2.part3.part4': false,
            });

            eventPatterns.set(/^part1\..+\.part3$/, {
                part1: false,
                'part1.part3': false,
                'part1.part2.part3': true,
                'part1.part2part3': false,
                'prefix.part1.part2.part3': false,
                'part1.part2.part3.postfix': false,
            });

            eventPatterns.set(/^part1\.[^\\.]+\.part3$/, {
                part1: false,
                'part1.part2': false,
                'part1.part2.part3': true,
                'prefix.part1.part2.part3': false,
            });

            eventPatterns.set(/^part1\.([^\\.]+\.){2}part4$/, {
                part1: false,
                'part1.part2': false,
                'part1.part2.part3': false,
                'part1.part2.part3.part4': true,
                'prefix.part1.part2.part3.part4': false,
                'part1.part2.part3.infix.part4': false,
                'part1.part2.part3.part4.postfix': false,
            });

            [...eventPatterns.entries()].forEach(([eventPattern, testEvents]) => {
                it(`should allow subscribing to events based on a regexp pattern (${eventPattern})`, () => {
                    pubsub.subscribe(eventPattern, noop);

                    Object.entries(testEvents).forEach(([eventName, matches]) => {
                        expect(pubsub.hasSubscribers(eventName)).toEqual(matches);
                    });
                });
            });

            it('should allow publishing an event to RegExp subscriptions', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn();
                const callback3 = jest.fn();
                const callback4 = jest.fn();
                const payload = {};

                jest.useFakeTimers();

                pubsub.subscribe(/^part1\..*/, callback1);
                pubsub.subscribe(/.*\.part2\..*/, callback2);
                pubsub.subscribe(/.*\.part4$/, callback3);
                pubsub.subscribe(/^part1\.([^\\.]*\.){2}part4$/, callback4);

                pubsub.publish('part1.part2.part3.part4', payload, true);

                expect(callback1).toHaveBeenCalledWith('part1.part2.part3.part4', payload);
                expect(callback2).toHaveBeenCalledWith('part1.part2.part3.part4', payload);
                expect(callback3).toHaveBeenCalledWith('part1.part2.part3.part4', payload);
                expect(callback4).toHaveBeenCalledWith('part1.part2.part3.part4', payload);
            });
        });

        describe('unsubscribing', () => {
            it('should allow unsubscribing with subscription token', () => {
                const token = pubsub.subscribe('test', noop);

                expect(pubsub.hasSubscribers('test')).toEqual(true);

                pubsub.unsubscribe(token);

                expect(pubsub.hasSubscribers('test')).toEqual(false);
            });

            it('should allow unsubscribing with a subscription token used as function', () => {
                const token = pubsub.subscribe('test', noop);

                expect(pubsub.hasSubscribers('test')).toEqual(true);

                token();

                expect(pubsub.hasSubscribers('test')).toEqual(false);
            });

            it('should allow unsubscribing selected callback with subscription token used as function', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn();
                const token = pubsub.subscribe('test', callback1);

                pubsub.subscribe('test', callback2);

                token();

                pubsub.publish('test', {}, true);

                expect(callback1).not.toHaveBeenCalled();
                expect(callback2).toHaveBeenCalled();
            });

            it('should allow unsubscribing from a specified event', () => {
                const callback = jest.fn();
                const payload = {};

                pubsub.subscribe('test1', callback);
                pubsub.subscribe('test2', callback);

                pubsub.unsubscribe('test1', callback);

                pubsub.publish('test1', payload, true);

                expect(callback).not.toHaveBeenCalled();

                pubsub.publish('test2', payload, true);

                expect(callback).toHaveBeenCalledWith('test2', payload);
            });

            it('should allow unsubscribing using an RegExp pattern used during subscription', () => {
                pubsub.subscribe(/part1\.part2\..*/, noop);

                expect(pubsub.hasSubscribers('part1.part2.part3')).toEqual(true);

                pubsub.unsubscribe(/part1\.part2\..*/, noop);

                expect(pubsub.hasSubscribers('part1.part2.part3')).toEqual(false);
            });

            it('should allow unsubscribing only given callback using an RegExp pattern', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn();
                const payload = {};

                pubsub.subscribe(/part1\.part2\..*/, callback1);
                pubsub.subscribe(/part1\.part2\..*/, callback2);

                pubsub.unsubscribe(/part1\.part2\..*/, callback1);

                pubsub.publish('part1.part2.part3', payload, true);

                expect(callback1).not.toHaveBeenCalled();
                expect(callback2).toHaveBeenCalledWith('part1.part2.part3', payload);
            });

            it('should allow unsubscribing from all events using given callback', () => {
                const callback = jest.fn();
                const payload = {};

                pubsub.subscribe('part1', callback);
                pubsub.subscribe('part1.part2', callback);
                pubsub.subscribe(/part1\.part2\..*/, callback);

                pubsub.unsubscribe(callback);

                pubsub.publish('part1', payload, true);
                pubsub.publish('part1.part2', payload, true);
                pubsub.publish('part1.part2.part3', payload, true);

                expect(callback).not.toHaveBeenCalled();
            });

            it('should allow unsubscribing given callback from all events', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn();
                const payload = {};

                pubsub.subscribe('part1', callback1);
                pubsub.subscribe('part1.part2', callback1);
                pubsub.subscribe(/part1\.part2\..+/, callback1);

                pubsub.subscribe('part1', callback2);
                pubsub.subscribe('part1.part2', callback2);
                pubsub.subscribe(/part1\.part2\..+/, callback2);

                pubsub.unsubscribe(callback1);

                pubsub.publish('part1', payload, true);
                pubsub.publish('part1.part2', payload, true);
                pubsub.publish('part1.part2.part3', payload, true);

                expect(callback1).not.toHaveBeenCalled();
                expect(callback2).toHaveBeenCalledTimes(3);
            });

            it('should allow unsubscribing all callbacks', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn();
                const callback3 = jest.fn();
                const callback4 = jest.fn();
                const callback5 = jest.fn();
                const payload = {};

                pubsub.subscribe('test1.part1', callback1);
                pubsub.subscribe('test1.part1.part2', callback2);
                pubsub.subscribe(/test1.*/, callback3);
                pubsub.subscribe('custon-rainbow-and-unicorns-event', callback3);

                pubsub.unsubscribeAll();

                pubsub.publish('test1.part1', payload, true);
                pubsub.publish('test1.part1.part2', payload, true);
                pubsub.publish('test1.part1.part2.part3', payload, true);
                pubsub.publish('custon-rainbow-and-unicorns-event', payload, true);

                expect(callback1).not.toHaveBeenCalled();
                expect(callback2).not.toHaveBeenCalled();
                expect(callback3).not.toHaveBeenCalled();
                expect(callback4).not.toHaveBeenCalled();
                expect(callback5).not.toHaveBeenCalled();
            });

            it('should allow unsubscribing all callbacks from a given event', () => {
                const callback1 = jest.fn();
                const callback2 = jest.fn();
                const payload = {};

                pubsub.subscribe('test1.part1', callback1);
                pubsub.subscribe('test1.part1', callback2);

                pubsub.unsubscribeAll('test1.part1');

                pubsub.publish('test1.part1', payload, true);

                expect(callback1).not.toHaveBeenCalled();
                expect(callback2).not.toHaveBeenCalled();
            });
        });

        describe('scoped API', () => {
            const eventName = 'test';
            const eventData = {};

            let scopedPubsub;

            beforeEach(() => {
                scopedPubsub = pubsub.isolate();
            });

            it('should expose specified interface', () => {
                expect(scopedPubsub).toEqual(expect.any(Object));

                expect(scopedPubsub).toEqual({
                    subscribe: expect.any(Function),
                    subscribeOnce: expect.any(Function),
                    hasSubscribers: expect.any(Function),
                    publish: expect.any(Function),
                    unsubscribe: expect.any(Function),
                    unsubscribeAll: expect.any(Function),
                });
            });

            it('should recognize subscription with hasSubscribers', () => {
                scopedPubsub.subscribe(eventName, () => { });

                expect(pubsub.hasSubscribers(eventName)).toBeTruthy();
            });

            it('should publish event to subscribers', () => {
                const spy = jest.fn();

                scopedPubsub.subscribe(eventName, spy);
                pubsub.publish(eventName, eventData, true);

                expect(spy).toHaveBeenCalledTimes(1);
                expect(spy).toHaveBeenCalledWith(eventName, eventData);
            });

            describe('Isolated Pub-Sub API (multiple namespaces)', () => {
                let otherScopedPubsub;

                let callback;
                let scopedCallback;
                let otherScopedCallback;

                beforeEach(() => {
                    callback = jest.fn();
                    scopedCallback = jest.fn();
                    otherScopedCallback = jest.fn();

                    otherScopedPubsub = pubsub.isolate();

                    pubsub.subscribe(eventName, callback);
                    scopedPubsub.subscribe(eventName, scopedCallback);
                    otherScopedPubsub.subscribe(eventName, otherScopedCallback);
                });

                it('should publish event to multiple subscribers (both global and isolated)', () => {
                    pubsub.publish(eventName, eventData, true);

                    expect(callback).toHaveBeenCalledTimes(1);
                    expect(callback).toHaveBeenCalledWith(eventName, eventData);

                    expect(scopedCallback).toHaveBeenCalledTimes(1);
                    expect(scopedCallback).toHaveBeenCalledWith(eventName, eventData);

                    expect(otherScopedCallback).toHaveBeenCalledTimes(1);
                    expect(otherScopedCallback).toHaveBeenCalledWith(eventName, eventData);
                });

                it('should unsubscribe given event only from selected scope', () => {
                    scopedPubsub.unsubscribeAll(eventName);
                    pubsub.publish(eventName, eventData, true);

                    expect(callback).toHaveBeenCalledTimes(1);
                    expect(callback).toHaveBeenCalledWith(eventName, eventData);

                    expect(scopedCallback).toHaveBeenCalledTimes(0);

                    expect(otherScopedCallback).toHaveBeenCalledTimes(1);
                    expect(otherScopedCallback).toHaveBeenCalledWith(eventName, eventData);
                });

                it('should not throw when unsubscribing all if there were no subscriptions in current scope', () => {
                    // create fresh isolated pubsub
                    scopedPubsub = pubsub.isolate();

                    expect(() => scopedPubsub.unsubscribeAll(eventName)).not.toThrow();
                });
            });
        });
    });
});

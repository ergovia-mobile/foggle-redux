import React from 'react';
import {connect, createProvider} from 'react-redux';
import {applyMiddleware, createStore, bindActionCreators} from 'redux';
import thunkMiddleware from 'redux-thunk';
import isBefore from 'date-fns/is_before'
import reducer from './state/reducer'
import {checkFeatures} from "./state/actions";
import PropTypes from 'prop-types';

const {Provider: ContextProvider, Consumer} = React.createContext({
    enabledFeatures: []
});

const FOGGLE_STORE_KEY = 'foggleStore';

/**
 * @typedef {Object} FoggleOptions
 * @property {function} getOptions returns all configured options
 * @property {function} getHost returns the configured host url
 * @property {function} getUpdateInterval returns the configured update interval in milliseconds. default is 600000ms (10 Minutes)
 * @property {function} setUpdateInterval sets the update interval in which Foggle fetches for new enabled features
 *
 */

/**
 * The configuration file for Foggle.
 *
 * @param {string} host required parameter to let Foggle know from where to fetch the enabled features
 * @return {FoggleOptions} an object with all configured options
 * @constructor
 */
export const FoggleConfig = (host) => {

    console.assert(host, 'Host not specified. Please pass a host to the FoggleConfig');

    const defaultOptions = {
        updateInterval: 1000 * 60 * 10,
        headers: {},
        host,
    };

    return {

        /**
         * Returns all configured options.
         *
         * @return {object} returns an object of all configured options
         */
        getOptions() {
            return { ...defaultOptions };
        },

        /**
         * Returns the configured host url.
         *
         * @return {string} the url
         */
        getHost() {
            return defaultOptions.host;
        },

        /**
         * getUpdateInterval returns the configured update interval in milliseconds. default is 600000ms (10 Minutes)
         *
         * @return {number} the interval
         */
        getUpdateInterval() {
            return defaultOptions.updateInterval;
        },

        /**
         * Sets the update interval in which Foggle fetches for new enabled features
         *
         * @param {number} interval the interval to set
         */
        setUpdateInterval(interval) {
            if (isNaN(interval)) {
                throw new Error('interval must be of type number')
            }
            defaultOptions.updateInterval = interval;
        },

        /**
         * Returns all the Headers that are configured and passed to the backend
         *
         * @return {object} an objects containing all headers
         */
        getHeaders() {
            return { ...defaultOptions.headers }
        },

        /**
         * Adds a header that will be sent to the Foggle backend. You can set a header via key and value, or via object.
         *
         * @param {string | object} name the name of the header to add, or the object containing all headers to add
         * @param {string} value the value of the header to add
         */
        addHeader(name = '', value) {

            if (typeof key === 'object' && typeof value === 'undefined') {
                defaultOptions.headers = { ...defaultOptions.headers, ...name}

            } else {
                defaultOptions.headers[name] = value;
            }

        },

        /**
         * Clears all headers that are configured
         */
        clearHeaders() {
            defaultOptions.headers = {}
        },

    }

};

/**
 * Private _FoggleProvider used to start the update interval and wrapping the application in a context
 */
class _FoggleProvider extends React.Component {

    componentDidMount() {

        setInterval(function update() {
            this.props.checkFeatures(this.props.config.getHost(), this.props.config.getHeaders());
            return update.bind(this);
        }.bind(this)(), this.props.config.getUpdateInterval())

    }

    render() {

        const {children, features} = this.props;

        return (
            <ContextProvider value={{features}}>
                {children}
            </ContextProvider>
        )
    }
}

/**
 * Because Foggle is built with redux, we assume that there is a store already. To let redux know, which store should be adressed for Foggle, we pass a static storeKey to
 * the connected Component
 */
function connectExtended(mapStateToProps, mapDispatchToProps, mergeProps, options = {}) {
    options.storeKey = FOGGLE_STORE_KEY;
    return connect(mapStateToProps, mapDispatchToProps, mergeProps, options)
}

const FoggleContainer = connectExtended(({ features }) => ({ features }), { checkFeatures })(_FoggleProvider);

/**
 * The ContextProvider to wrap around your App. It is used to provide all the enabled feautres around your application.
 */
export class FoggleProvider extends React.Component {

    constructor(props) {
        super(props);
        this.provider = createProvider(FOGGLE_STORE_KEY);
        this.store = createStore(reducer, applyMiddleware(thunkMiddleware))
    }

    render() {

        const {children, config = FoggleConfig() } = this.props;

        const ReduxProvider = this.provider;

        return (
            <ReduxProvider store={this.store}>
                <FoggleContainer config={config}>
                    {children}
                </FoggleContainer>
            </ReduxProvider>
        );
    }

}

FoggleProvider.propTypes = {
    config: PropTypes.exact({
        getOptions: PropTypes.func.isRequired,
        getHost: PropTypes.func.isRequired,
        getUpdateInterval: PropTypes.func.isRequired,
        getHeaders: PropTypes.func.isRequired,
        addHeader: PropTypes.func.isRequired,
        clearHeaders: PropTypes.func.isRequired
    })
};

/**
 * The Consumer to wrap around the feature that should be toggled. The id property is mandatory because it defines, which feature should be toggled.
 */
export class FoggleConsumer extends React.Component {

    render() {

        const {id, children} = this.props;

        return (
            <Consumer>
                {
                    value => {
                        const found = value.features.enabledFeatures.find(feature => feature.id === id);
                        if (found) {
                            return (found.manually_activated || isBefore(found.release_date, new Date())) ? children : null;
                        }
                        return null;

                    }
                }
            </Consumer>
        );
    }
}

FoggleConsumer.propTypes = {
    id: PropTypes.string.isRequired
};

/**
 * Higher-Order-Component if you wish to activate Foggle on container level without using the FoggleConsumer
 *
 * @param {Object} Component the Component that should be wrapped in Foggle
 * @param {string} featureId the id of the feature that should be toggled
 * @param {object} mapStateToProps maps the current state the components props
 * @param {object} mapDispatchToProps maps the redux actions to the components props
 * @return {function} the wrapped component
 */
export function withFoggle(Component, featureId, mapStateToProps, mapDispatchToProps) {

    class FoggyComponent extends React.PureComponent {

        constructor(props) {
            super(props);
            const { dipsatch } = props;
            this.boundActionCreators = bindActionCreators(mapDispatchToProps, dipsatch);
        }

        render() {
            return (
                <Consumer>
                    {
                        value => {

                            const found = value.features.enabledFeatures.find(feature => feature.id === featureId);
                            if (found) {
                                return found.manually_activated || isBefore(found.release_date, new Date()) ? <Component {...this.props} {...this.boundActionCreators}/> : null;
                            }

                            return null;

                        }
                    }
                </Consumer>
            );
        }

    }


    return connect(mapStateToProps)(FoggyComponent);

}

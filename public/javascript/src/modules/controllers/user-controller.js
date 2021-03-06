define([
    'require',
    'angular',
    'underscore',
    'ngApp'
], function (require) {
    var angular = require('angular'),
        ngApp = require('ngApp'),
        _ = require('underscore');

    ngApp.controller('userController', [
        '$scope', 'request',
        function ($scope, request) {
            $scope.user = {
                // Get user ID
            };


            /**
             *
             * @param propName
             */
            $scope.getUserDefault = function (propName) {
                return _.find($scope.user.defaults, {key: propName});
            };

            $scope.getUserDefaults = function () {
                return $scope.user.defaults;
            };

            /**
             *
             * @param propData
             */
            $scope.addUserDefault = function (propData) {
                $scope.user.defaults.push(_.pick(propData, ['key', 'val']));
            };

            /**
             *
             * @param propData
             */
            $scope.updateUserDefault = function (propData) {
                var propDefault = _.find($scope.user.defaults, function (propDefaultData) {
                    return propDefaultData.key == propData.key;
                });
                propDefault = _.pick(propData, ['key', 'val']);
            };

            /**
             *
             * @param propData
             */
            $scope.setUserDefault = function (propData) {
                var currentDefault = $scope.getUserDefault(propData.key);
                if (!currentDefault) {
                    $scope.addUserDefault(propData);
                } else {
                    $scope.updateUserDefault(propData);
                }
            };

            /**
             *
             * @param {String} propName
             * @param {Number} priorityVal
             */
            $scope.setPropPriority = function (propName, priorityVal) {
                var propOrderData = _.find($scope.user.meta, function (metaProp) {
                    return metaProp.name == 'propOrder';
                });
                // define if not set
                if (!propOrderData) {
                    propOrderData = {name: 'propOrder', value: '{}'};
                    $scope.user.meta.push(propOrderData);
                }
                var propOrderValue = JSON.parse(propOrderData.value);
                propOrderValue[propName] = priorityVal;
                propOrderData.value = JSON.stringify(propOrderValue);
            };

            $scope.setPropPriorities = function (propPriorities) {
                _.forEach(propPriorities, function (propOrderVal, propName) {
                    $scope.setPropPriority(propName, propOrderVal);
                });
            };

            $scope.getPropPriorities = function () {
                var propPriorities = _.find($scope.user.meta, function (metaProp) {
                    return metaProp.name == 'propOrder';
                });
                // define if not set
                if (!propPriorities) {
                    propPriorities = {name: 'propOrder', value: '{}'};
                    $scope.user.meta.push(propPriorities);
                }
                return JSON.parse(propPriorities.value);
            };

            $scope.getPropPriority = function (propName) {
                var propPriorities = $scope.getPropPriorities();
                return propPriorities[propName];
            };

            $scope.sortSpeciesProps = function (props) {
                var propPriorities = _.defaults($scope.getPropPriorities(), {
                    petId: 0,
                    images: 1,
                    petName: 2,
                    species: 3
                });
                return _.sortBy(props, function (propData) {
                    // default to prop order in not specified
                    return propPriorities[propData.key] ? propPriorities[propData.key] : props.length - 1;
                })
            };

            /**
             * @param {Object} options
             * @param {Function} options.done
             **/
            $scope.saveUser = function (options) {
                var _options = _.defaults(options, {});
                request.post('/api/v1/user/save', $scope.user).then(
                    function success() {
                        if (_options.done) _options.done(null, $scope.user);
                    },
                    function failure() {
                        if (_options.done) _options.done(new Error('Could not save user'));
                    }
                );
            };


            /**
             * @param {Object} options
             * @param {Function} options.done
             **/
            $scope.getUserData = function (options) {
                var _options = _.defaults(options, {});
                request.get('/api/v1/user').then(
                    function success(response) {
                        $scope.user = response.data;
                        if (_options.done) _options.done(null, $scope.user);
                    },
                    function failure() {
                        if (_options.done) _options.done(new Error('Could not load user'));
                    }
                );
            };

            function init() {
                console.log("userController - fetching user data");
                $scope.getUserData({
                    done: function (err, userData) {
                        console.log('getUserData() = %o', arguments);
                        // hack to handle lack ng-view initialization after initial render
                        $scope._persistCurrentPath();
                    }
                })
            }

            init();
        }]);
});

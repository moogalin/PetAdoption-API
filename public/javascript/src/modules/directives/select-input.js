define([
    'require',
    'underscore',
    'text!./views/select-input.html',
    'ngApp'
], function (require) {
    var _ = require('underscore'),
        ngApp = require('ngApp');

    return ngApp.directive('selectInput', function () {
        return {
            restrict: 'AEC',
            template: require('text!./views/select-input.html'),
            controller: ['$scope', '$element',
                function ($scope, $element) {
                    console.log('select field: %o', $scope);
                    function init(){
                        if($scope['propData'].valType == 'Boolean' && $scope['propData'].options.length == 0){
                            $scope['propData'].options = [ true, false];
                            console.log("setting %s options w/ %o", $scope['propData'].key, $scope['propData']);
                        }
                        if ($scope['propData'].key == 'species') {
                            console.log("!setting species options w/ %o", $scope.speciesList);
                            $scope['propData'].options = $scope.speciesList;
                        }
                    }

                    $scope.getLabel = function (option){
                        if(option === true){
                            return 'Yes';
                        } else if(option === false){
                            return 'No'
                        } else {
                            return option;
                        }

                    };

                    $scope.$watch('propData.options', function(){
                        init();
                    });

                    $scope.$watch('propData.val', function(){
                        $scope.setField($scope.propData.key, $scope.propData);
                    })
                }]
        };
    });
});
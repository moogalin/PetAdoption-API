var util = require('util'),
    fs = require('fs'),
    path = require('path'),
    url = require('url'),

    async = require('async'),
    _ = require('lodash'),

    Debuggable = require('../../lib/debuggable'),
    Species = require('../../lib/species'),
    Animal = require('../../lib/animal'),
    config = require('../../config');

/**
 *
 * @extends Debuggable
 * @class DataFormatter
 * @param {Object} [options]
 * @param {Boolean} [options.createMissingFields=false]
 * @param {Boolean} [options.populateEmptyFields=false]
 * @constructor
 */
function DataFormatter(options) {
    var _options = _.defaults(options, {
        debugTag: 'DataFormatter: ',
        debugLevel: Debuggable.PROD,
        createMissingFields: false,
        populateEmptyFields: false
    });

    this.setDebugLevel(_options.debugLevel);
    this.setDebugTag(_options.debugTag);

    this._config = _options;
    this.speciesCache = {};
}

DataFormatter.prototype = {


    /**
     *
     * @param {*[]} options
     * @returns {*}
     */
    _pickRandomOption: function (options) {
        if (options && options.length > 0) {
            var randOptionIndex = Math.floor(Math.random() * options.length);
            return options[randOptionIndex]
        }
        return false;
    },

    /**
     *
     * @param {MongoAPIDatabase} database
     * @param {Object} animalProps
     * @param {Object} [options]
     */
    _saveAnimal: function (database, animalProps, options) {
        var _options = _.defaults(options, {}),
            reducedAnimalProps = _.reduce(animalProps, function (collection, propData, propName) {
                collection[propName] = propData.val;
                return collection;
            }, {});

        this.log(Debuggable.MED, 'saving %j', reducedAnimalProps);

        database.saveAnimal(reducedAnimalProps.species, reducedAnimalProps, {
            debugLevel: _options.debugLevel,
            species: _options.species,
            complete: function (err, newAnimal) {
                if (err) console.error(err);
                if (_options.complete) _options.complete.apply(_options.context, [null, newAnimal])
            }
        });
    },


    /**
     *
     * @param {MongoAPIDatabase} database
     * @param {Object} [options]
     * @param {Boolean} [options.createMissingFields=false]
     * @param {Boolean} [options.populateEmptyFields=false]
     * @param {Function} [options.complete]
     */
    formatDB: function (database, options) {
        var self = this,
            _options = _.defaults(options, this._config);

        database.getSpeciesList({
            complete: function (err, speciesList) {
                // get list of species

                async.eachSeries(speciesList,
                    function each(speciesName, onSpeciesFetched) {

                        // save each species data to speciesCache
                        database.findSpecies(speciesName, {
                            complete: function (err, speciesData) {
                                if (err) return onSpeciesFetched(err);
                                self.speciesCache[speciesName] = new Species(speciesName, speciesData.props);
                                onSpeciesFetched()
                            }
                        })
                    },
                    function complete() {

                        // find all animals
                        database.findAnimals({}, {
                            debugLevel: _options.debugLevel,
                            complete: function (err, animals) {

                                // format each animal
                                async.eachOf(animals,
                                    function each(animalProps, index, onAnimalFormatted) {
                                        var species = self.speciesCache[animalProps.species.val];
                                        if (species) {
                                            // format if species found in cache
                                            var formattedAnimalProps = self.formatAnimal(species.getSpeciesProps(), animalProps, {
                                                createMissingFields: _options.createMissingFields,
                                                populateEmptyFields: _options.populateEmptyFields
                                            });

                                            // save formatted animal
                                            self._saveAnimal(database, formattedAnimalProps, {
                                                species: species,
                                                complete: function (err) {
                                                    onAnimalFormatted(err);
                                                }
                                            });
                                        } else {
                                            // skip if no species data found
                                            onAnimalFormatted();
                                        }

                                    },
                                    function complete() {
                                        if (_options.complete) _options.complete.apply(_options.context);
                                    });
                            }
                        });
                    })
            }
        });
    },

    /**
     *
     * @param speciesProps
     * @param animalProps
     * @param {Object} [options]
     * @param {Boolean} [options.createMissingFields=false]
     * @param {Boolean} [options.populateEmptyFields=false]
     * @returns {Object} animalProps
     */
    formatAnimal: function (speciesProps, animalProps, options) {
        var self = this,
            _options = _.defaults(options, this._config),
            // use example because of how data was unfortunately formatted initially
            species = _.find(speciesProps, {key: 'species'}).example.toLowerCase();

        this.log(Debuggable.LOW, 'formatting a %s', species);
        _.forEach(speciesProps, function (speciesPropData) {
            switch (speciesPropData.key) {
                case 'petId':
                    animalProps[speciesPropData.key] = _.defaults({
                        val: animalProps[speciesPropData.key] ? animalProps[speciesPropData.key].val : null
                    }, speciesPropData);
                    break;
                case 'images':
                    var images = (animalProps[speciesPropData.key] && _.isArray(animalProps[speciesPropData.key].val)) ? animalProps[speciesPropData.key].val : (speciesPropData.defaultVal || speciesPropData.example);
                    speciesPropData.val = self.formatImagesArray(images, {species: species});
                    animalProps[speciesPropData.key] = speciesPropData;
                    break;
                case 'species':
                    animalProps[speciesPropData.key] = _.defaults({val: species}, animalProps[speciesPropData.key] || speciesPropData);
                    break;
                default:
                    if (_options.createMissingFields) {
                        // assign values for all possible fields
                        animalProps[speciesPropData.key] = _.defaults(animalProps[speciesPropData.key], speciesPropData);
                    } else if (animalProps[speciesPropData.key]) {
                        // assign values for only currently assigned fields
                        animalProps[speciesPropData.key] = _.defaults(animalProps[speciesPropData.key], speciesPropData);
                    }

                    if (_options.populateEmptyFields && animalProps[speciesPropData.key] && _.isUndefined(animalProps[speciesPropData.key].val)) {
                        // chose a random value for a field
                        animalProps[speciesPropData.key].val = self._pickRandomOption(speciesPropData.options) || animalProps[speciesPropData.key].val || speciesPropData.example || speciesPropData.defaultVal;
                    }
            }
        });
        return animalProps;
    },

    formatImagesArray: function (imagesArr, options) {
        var _options = _.defaults({species: 'dog'}, options);
        this.log(Debuggable.LOW, "formatting %s images", imagesArr.length);

        return imagesArr.map(function formatImgURL(imageURL) {
            var fileBaseName = path.basename(imageURL),
                relativeImagePath = util.format('/images/pet/%s/', _options.species);
            return url.resolve(config.ASSETS_DOMAIN, path.join(relativeImagePath, fileBaseName));
        });
    }
};

_.extend(DataFormatter.prototype, Debuggable.prototype);


module.exports = DataFormatter;

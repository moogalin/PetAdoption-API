var fs = require('fs'),
    path = require('path'),
    url = require('url'),
    util = require('util'),
    stream = require('stream'),

    _ = require('lodash'),
    async = require('async'),
    multer = require('multer'),
    sharp = require('sharp'),

    config = require('../../config'),
    S3Bucket = require('../../s3'),
    Debuggable = require('../../lib/debuggable'),
    DBFormatter = require('../utils/formatter'),
    CSVImporter = require('../../csv-importer');

/**
 * @extends Debuggable
 * @class APIController
 * @param {MongoAPIDatabase} [database]
 * @param {Object} [options]
 * @param {DebugLevel} [options.debugLevel]
 * @param {Number} [options.pageSize]
 * @param {Number} [options.maxImageHeight]
 * @param {Object} [options.paths]
 * @param {String} [options.paths.localRoot]
 * @param {String} [options.paths.images]
 * @param {String} [options.paths.placeholders]
 * @param {DebugLevel} [options.debugLevel=Debuggable.PROD]
 * @constructor
 */
function APIController(database, options) {
    this.setDebugTag('APIController: ');

    var self = this;

    this.database = this.database || database; // inherit database if already defined
    this._apiOptions = _.defaults(options, {
        debugLevel: Debuggable.PROD,
        debugTag: "APIController: ",
        pageSize: 10,
        maxImageHeight: 1080,
        paths: {
            localRoot: path.resolve(process.cwd(), 'public/'),
            images: 'images/pet/',
            placeholders: 'images/placeholders/'
        }
    });

    this.setDebugTag(this._apiOptions.debugTag);
    this.setDebugLevel(this._apiOptions.debugLevel);

    this.s3 = new S3Bucket(config.DEVELOPMENT_ENV ? config.S3_DEV_BUCKET_NAME : config.S3_PROD_BUCKET_NAME);
    this.storage = multer.memoryStorage();

    this.uploader = multer({storage: this.storage});
    this.log(Debuggable.LOW, 'APIController() = %s', this.dump());
    return this;
}

APIController.prototype = {

    getSpeciesList: function (callback) {
        this.database.getSpeciesList({
            complete: callback
        })
    },

    onUserUpdate: function () {
        var self = this;
        return function (req, res, next) {
            if (!req.body.id) {
                var unauthorizedErr = new Error('User id not provided');
                unauthorizedErr.code = 400;
                next(unauthorizedErr);
            } else {
                self.database.saveUser(req.body, {
                    complete: function (err, user) {
                        if (err) return next(err);
                        res.locals.simplifiedFormat = false;
                        res.locals.data = user;
                        next();
                    }
                })
            }
        }
    },

    onUserRetrieve: function () {
        var self = this;
        return function (req, res, next) {
            var userId = (req.user) ? req.user.id : false;
            if (!userId) {
                var unauthorizedErr = new Error('Unauthorized');
                unauthorizedErr.status = 401;
                next(unauthorizedErr);
            } else {
                self.database.findUser({
                    id: userId
                }, {
                    complete: function (err, user) {
                        if (err) return next(err);
                        res.locals.simplifiedFormat = false;
                        res.locals.data = user;
                        next();
                    }
                })
            }
        }
    },

    onSpeciesListRequest: function () {
        var self = this;
        return function (req, res, next) {
            self.database.getSpeciesList({
                complete: function (err, speciesList) {
                    if (err) {
                        self.error(err);
                        next(err);
                    } else {
                        res.json(speciesList);
                    }
                }
            });
        }
    },

    onListSpeciesRequest: function () {
        var self = this;
        return function (req, res, next) {

            res.locals.pageNumber = req.params['pageNumber'];

            self.log(Debuggable.MED, 'onListRequeset()');
            self.database.findAnimals({species: req.params.species},
                {
                    debug: self._apiOptions.debugLevel,
                    complete: function (err, animals) {
                        if (err) {
                            next(err);
                        } else if (_.isArray(animals)) {
                            res.locals.data = animals;
                            next();
                        } else {
                            res.locals.data = [];
                            next();
                        }
                    }
                });
        }
    },

    onListAllRequest: function () {
        var self = this;
        return function (req, res, next) {
            res.locals.pageNumber = req.params['pageNumber'];

            self.database.findAnimals({}, {
                debug: self._apiOptions.debugLevel,
                complete: function (err, animals) {
                    if (err) {
                        next(err);
                    } else {
                        res.locals.data = animals;
                        next();
                    }
                }
            });
        }
    },

    onQueryRequest: function () {
        var self = this;
        return function (req, res, next) {
            var queryData = req.body;
            res.locals.pageNumber = req.params['pageNumber'];

            self.database.findAnimals(queryData, {
                debug: self._apiOptions.debugLevel,
                complete: function (err, animals) {
                    if (err) {
                        next(err);
                    } else if (animals && animals.length > 0) {
                        res.locals.data = animals;
                        next();
                    } else {
                        res.locals.data = [];
                        next();
                    }
                }
            });

        }
    },

    onOptionsRequest: function () {
        var self = this;
        return function (req, res, next) {
            var species = req.params['species'];

            self.database.findSpecies(species, {
                complete: function (err, speciesData) {
                    if (err) {
                        next(err);
                    } else {
                        res.locals.simplifiedFormat = false;
                        res.locals.data = _.reduce(speciesData.props, function (collection, propData) {
                            if (propData) collection[propData.key] = propData.options;
                            return collection;
                        }, {});
                        next();
                    }
                }
            });
        }
    },

    onSingleOptionRequest: function () {
        var self = this;
        return function (req, res, next) {
            var species = req.params['species'],
                optionName = req.params['option'];


            self.database.findSpecies(species, {
                complete: function (err, speciesData) {
                    if (err) {
                        next(err);
                    } else {
                        res.locals.simplifiedFormat = false;
                        var speciesPropData = _.find(speciesData.props, {key: optionName});
                        res.locals.data = (speciesPropData) ? speciesPropData.options : [];
                        next();
                    }
                }
            });
        }
    },

    onRetrieveSpecies: function () {
        var self = this;
        return function (req, res, next) {

            self.database.findSpecies(req.params.species, {
                debug: self._apiOptions.debugLevel,
                complete: function (err, speciesData) {
                    if (err) {
                        next(err)
                    } else {
                        res.locals.simplifiedFormat = false;
                        res.locals.data = speciesData.props;
                        next();
                    }
                }
            })
        }
    },

    onDeleteAnimal: function () {
        var self = this;
        return function (req, res, next) {

            self.database.removeAnimal(
                req.params.species,
                req.body, {
                    debug: self._apiOptions.debugLevel,
                    complete: function (err, result) {
                        if (err) {
                            next(err);
                        } else {
                            res.json(result)
                        }
                    }
                })
        }
    },

    onSaveAnimalJSON: function () {
        var self = this;
        return function (req, res, next) {

            self.database.saveAnimal(
                req.params.species,
                req.body, {
                    debug: this._apiOptions.debugLevel,
                    complete: function (err, newAnimal) {
                        if (err) {
                            next(err);
                        } else {
                            res.locals.simplifiedFormat = false;
                            res.locals.data = newAnimal;
                            next();
                        }
                    }
                });
        }
    },

    onSaveAnimalForm: function () {
        var self = this;
        return function (req, res, next) {
            var props = req.body,
                imagesValue = props.images || '';

            props.images = imagesValue.split(',');

            async.each(req.files,
                function each(fileMeta, done) {
                    var bufferStream = new stream.PassThrough(),
                        publicPath = path.join(self._apiOptions.paths.images, (req.params.species + '/'), fileMeta.originalname);

                    bufferStream.end(fileMeta.buffer);

                    var imageFormatter = sharp()
                        .resize(null, self._apiOptions.maxImageHeight)
                        .withoutEnlargement();

                    var formattedBufferStream = bufferStream.pipe(imageFormatter);

                    self.s3.saveReadableStream(formattedBufferStream, publicPath, function (err, result) {
                        if (err) return done(err);
                        props.images.push(result.Location);
                        done();
                    });
                },
                function complete(err) {
                    if (err) return next(err);
                    props.images = _.reject(props.images, function (url) {
                        // only truthy values
                        return !url;
                    });
                    self.database.saveAnimal(
                        req.params.species,
                        props, {
                            debug: self._apiOptions.debugLevel,
                            complete: function (err, newAnimal) {
                                if (err) {
                                    next(err);
                                } else {
                                    res.locals.simplifiedFormat = false;
                                    res.locals.data = newAnimal;
                                    next()
                                }
                            }
                        });
                });

        }
    },

    onSaveSpecies: function () {
        var self = this;
        return function (req, res, next) {
            self.database.saveSpecies(
                req.params.species,
                req.body, {
                    debug: self._apiOptions.debugLevel,
                    complete: function (err, updatedSpecies) {
                        if (err) {
                            next(err);
                        } else {
                            res.locals.simplifiedFormat = false;
                            res.locals.data = updatedSpecies;
                            next();
                        }
                    }
                });
        }
    },

    onSaveSpeciesPlaceholder: function () {
        var self = this;
        return function (req, res, next) {
            var species = req.params.species,
                bufferStream = new stream.PassThrough(),
                publicPath = path.join(self._apiOptions.paths.placeholders, species + '.png');
            // TODO determine and use proper file extension

            bufferStream.end(req.file.buffer);

            var imageFormatter = sharp()
                .resize(null, self._apiOptions.maxImageHeight)
                .withoutEnlargement();

            var formattedBufferStream = bufferStream.pipe(imageFormatter);

            self.s3.saveReadableStream(formattedBufferStream, publicPath, function (err, result) {
                if (err) return next(err);
                res.json({result: "success", location: result.Location});
            });
        }
    },

    onCreateSpecies: function () {
        var self = this;
        return function (req, res, next) {

            self.database.saveSpecies(
                req.params.species,
                req.body, {
                    debug: self._apiOptions.debugLevel,
                    complete: function (err, newSpecies) {
                        if (err) {
                            next(err);
                        } else {
                            res.locals.simplifiedFormat = false;
                            res.locals.data = newSpecies;
                            next();
                        }
                    }
                });
        }
    },

    onDeleteSpecies: function () {
        var self = this;
        return function (req, res, next) {

            self.database.deleteSpecies(
                req.params.species, {
                    debug: self._apiOptions.debugLevel,
                    complete: function (err) {
                        if (err) {
                            next(err);
                        } else {
                            res.json({result: 'success'})
                        }
                    }
                });
        }
    },

    onFormatDB: function () {
        var self = this;
        return function (req, res, next) {

            var dbFormatter = new DBFormatter();
            dbFormatter.formatDB(self.database, {
                complete: function (err) {
                    if (err) return next(err);
                    res.send({result: 'success'})
                }
            });
        }
    },

    onReset: function () {
        var self = this,
            csvImporter = new CSVImporter();

        return function (req, res, next) {

            self.database.clearAnimals(function () {

                csvImporter.run(function (petCollection) {

                    self.log('dataset parsed');
                    var numOfPets = petCollection.length,
                        savedPetCount = 1;

                    async.each(petCollection,
                        function each(petData, done) {
                            self.log(Debuggable.MED, 'saving pet %j', petData);
                            self.database.saveAnimal(petData.species || 'dog',
                                petData,
                                {
                                    debug: self._apiOptions.debugLevel,
                                    complete: function (err) {
                                        if (err) {
                                            self.error(self.dump(err));
                                            done(err);
                                        } else {
                                            self.log(Debuggable.LOW, 'saved %s/%s pets', savedPetCount++, numOfPets);
                                            done();
                                        }
                                    }
                                });
                        },
                        function done(err) {
                            if (err) {
                                next(err);
                            } else {
                                // execute db formatting as well
                                self.onFormatDB()(req, res, next);
                            }
                        });

                });
            });

        }
    }

};

_.extend(APIController.prototype, Debuggable.prototype);

module.exports = APIController;

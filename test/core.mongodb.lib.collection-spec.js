var expect = require('expect.js'),

    MongooseModel = require('../core/mongodb/lib/collection'),
    Debuggable = require('../core/lib/debuggable'),
    UserSchema = require('../core/mongodb/schemas/user'),
    MongoDBAdapter = require('../core/mongodb/lib/adapter');

describe("Collection", function () {
    var dbAdapter,
        tUserProps = {id: 'test', firstName: 'hello', lastName: 'world'},
        user,
        aUser,
        UserModel;

    before(function (done) {
        dbAdapter = new MongoDBAdapter({
            debugLevel: Debuggable.PROD
        });
        dbAdapter.connect({
            onSuccess: function () {
                user = new MongooseModel('test_model_factory',
                    UserSchema,
                    {
                    debugTag: 'aSpecies: ',
                    debugLevel: Debuggable.PROD
                });
                UserModel = user.toMongooseModel(dbAdapter);
                done();
            },
            onFailure: function () {
                throw new Error("Could not connect to DB")
            }
        })
    });

    after(function (done) {
        UserModel.remove({}, function () {
            dbAdapter.close(function () {
                done();
            });
        });
    });

    describe("save()", function () {

        it("saves an object", function (done) {
            var tUser = new UserModel(tUserProps);
            tUser.save(function (err, savedUser) {
                if (err) throw err;
                aUser = savedUser;
                expect(aUser).not.to.be(undefined, 'No user was returned on save');
                expect(aUser.firstName).to.equal(tUserProps.firstName, 'The firstName was not correctly return in the saved user');
                expect(aUser.id).not.to.be(undefined, 'The ID was not defined in the saved user');
                done();
            });
        })
    });

    describe("findOne()", function () {
        it("returns a previously saved object", function (done) {
            UserModel.findOne({id: aUser.id})
                .lean()
                .exec(function (err, foundUser) {
                    if (err) throw err;
                    expect(foundUser).not.to.be(undefined, 'No user was found');
                    expect(foundUser.firstName).to.equal(tUserProps.firstName, 'The firstName was not correctly return in the found user');
                    expect(foundUser.id).not.to.be(undefined, 'The ID was not defined in the found user');
                    done()
                });

        })
    });

});

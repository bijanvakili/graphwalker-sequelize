var crypto = require('crypto');
var _           = require('lodash');
var Sequelize   = require('sequelize');

function makeHash(s) {
  var hash = crypto.createHash('sha1');

  hash.update(s);
  return hash.digest('hex');
}

function extractVertices(sequelizeModels) {
    return _(sequelizeModels)
      .filter((model) => model instanceof Sequelize.Model)
      .map((model) => {
        const modelName = model.name;

        return {
          id: makeHash(modelName),
          label: modelName,
          searchableComponents: [modelName],
          properties: {}
        };
      })
      .value();
}

function extractEdges(sequelizeModels, vertexMap) {
  var M2M_ASSOCIATION_TYPE_NAMES = ['BelongsToMany', 'HasMany'];
  var MULTIPLICITY_MAP = {
    'BelongsTo': '*..1',
    'BelongsToMany': '*..*',
    'HasMany': '1..*',
    'HasOne': '1..1'
  };
  var throughModels = {};

  const resultMap = _(sequelizeModels)
    .filter((model) => model instanceof Sequelize.Model)
    .reduce((edgeMap, model) => {
      const sourceId = makeHash(model.name);

      _.forEach(model.associations, (association) => {
        var associationType = association.associationType;
        var isM2M = _.contains(M2M_ASSOCIATION_TYPE_NAMES, associationType);

        // mark through models for later exclusion
        var throughModelName = null;
        if (isM2M && association.throughModel) {
          throughModelName = association.throughModel.name;
          throughModels[throughModelName] = 1;
        }

        var targetField;
        if (isM2M) {
          targetField = association.targetIdentifier || association.target.primaryKeyField;
        } else if (associationType === 'HasOne') {
          targetField = association.foreignKey;
        } else {
          targetField = association.targetIdentifier;
        }

        var destId = makeHash(association.target.name);
        if (!_.has(vertexMap, destId)) {
            throw new Error('Unable to find association target: ' + association.target.name);
        }

        var edgeId = makeHash(associationType + '(' + sourceId + ',' + destId + ')');
        var existingEdge = _.get(edgeMap, edgeId);
        var sourceField = association.identifier || association.identifierField;

        if (!existingEdge) {
          var edge = {
            id: edgeId,
            label: null,
            source: sourceId,
            dest: destId,

            properties: {
              sourceFields: [sourceField],
              targetFields: [targetField],
              type: associationType,
              multiplicity: MULTIPLICITY_MAP[associationType],
              throughModel: throughModelName
            }
          };
          edgeMap[edgeId] = edge;
        } else {
          existingEdge.properties.sourceFields.push(sourceField);
          existingEdge.properties.targetFields.push(targetField);
        }
      });

      return edgeMap;
    }, {});

  return _(resultMap)
    .forEach((edge, edgeId) => {
      edge.label = edge.properties.sourceFields.join(', ') + ' (' + edge.properties.multiplicity + ')';
    })
    .values();
}

function extractModelGraph(sequelizeModels) {
    var graph = {};
    graph.vertices = extractVertices(sequelizeModels);

    var vertexMap = _.reduce(
      graph.vertices,
      (accum, v) => {
          accum[v.id] = v;
          return accum;
      },
      {}
    );

    graph.edges = extractEdges(sequelizeModels, vertexMap);

        // .filter((node) => throughModels[node.name] !== 1)
        // .value();
    return graph;
}


var graph = extractModelGraph(earnestModels);

process.stdout.write(
    JSON.stringify(graph, null, 2) + '\n',
    'utf-8',
    () => process.exit(0)
);

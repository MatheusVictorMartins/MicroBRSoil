const bcrypt = require('bcrypt');

const users = [
  {
    id: 1,
    username: 'admin',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin'
  },
  {
    id: 2,
    username: 'joao',
    passwordHash: bcrypt.hashSync('senha123', 10),
    role: 'user'
  }
];

const pipelines = {};

// PLACEHOLDER
const samples= [
    {
      id: "00000",
      material: "Water",
      projectName: "Subsurface mine microbial mat metagenome",
      location: "Japan",
      creationDate: "2015-06-19",
    },
    {
      id: "00001",
      material: "Soil; Water",
      projectName: "Rice rhizosphere metagenome",
      location: "Japan",
      creationDate: "2016-07-25",
    },
    {
      id: "00002",
      material: "Soil; Water",
      projectName: "Metagenomic analysis of rice shoot-associated bacteria",
      location: "United States of America",
      creationDate: "2016-07-25",
    },
    {
      id: "00003",
      material: "Soil",
      projectName: "Metagenomic analysis of rice shoot-associated bacteria",
      location: "United States of America",
      creationDate: "2016-10-06",
    },
    {
      id: "00004",
      material: "Soil",
      projectName: "Dynamics of the gene pool of soil microbiota disturbed by chemical pollution",
      location: "United States of America",
      creationDate: "2016-10-06",
    },
    {
      id: "00005",
      material: "Water",
      projectName: "Dynamics of the gene pool of soil microbiota disturbed by chemical pollution",
      location: "Japan",
      creationDate: "2017-03-23",
    },
    {
      id: "00005",
      material: "Water",
      projectName: "Dynamics of the gene pool of soil microbiota disturbed by chemical pollution",
      location: "Japan",
      creationDate: "2017-03-23",
    },
    {
      id: "00005",
      material: "Water",
      projectName: "Dynamics of the gene pool of soil microbiota disturbed by chemical pollution",
      location: "Japan",
      creationDate: "2017-03-23",
    },
    {
      id: "00005",
      material: "Water",
      projectName: "Dynamics of the gene pool of soil microbiota disturbed by chemical pollution",
      location: "Japan",
      creationDate: "2017-03-23",
    },
    {
      id: "00005",
      material: "Water",
      projectName: "Dynamics of the gene pool of soil microbiota disturbed by chemical pollution",
      location: "Japan",
      creationDate: "2017-03-23",
    },
    {
      id: "00005",
      material: "Water",
      projectName: "Dynamics of the gene pool of soil microbiota disturbed by chemical pollution",
      location: "Japan",
      creationDate: "2017-03-23",
    }
];

module.exports = { users, pipelines, samples };

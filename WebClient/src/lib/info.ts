export const Program = {
  name: "Project SCARS",
  description: "School Canteen Automated Reporting System",
  version: "0.3.0",
};

export const Connections = {
  CentralServer: {
    endpoint: "http://localhost:8000/api/v1",
  },
  LocalServer: {
    // TODO: WIP
    host: "localhost",
    port: 8001,
  },
};

export const LocalStorage = {
  jwt_name: "t",
};

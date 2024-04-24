module.exports = (app) => {
    const ent_hangmuc = require("../controllers/ent_hangmuc.controller.js");
    const {isAuthenticated}= require('../middleware/auth_middleware.js');
  
    var router = require("express").Router();
  
    router.post("/create",[isAuthenticated], ent_hangmuc.create);
    router.get("/",[isAuthenticated], ent_hangmuc.get);
    router.put("/update/:id",[isAuthenticated], ent_hangmuc.update);
    router.put("/delete/:id",isAuthenticated, ent_hangmuc.delete);
    router.get("/filter/:id",isAuthenticated, ent_hangmuc.filterByKhuvuc);
  
  
    app.use("/api/ent_hangmuc", router);
  };
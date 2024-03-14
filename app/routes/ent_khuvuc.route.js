module.exports = (app) => {
  const ent_khuvuc = require("../controllers/ent_khuvuc.controller.js");
  const { isAuthenticated, isAdmin } = require("../middleware/auth_middleware");

  var router = require("express").Router();

  router.post("/create", [isAuthenticated, isAdmin], ent_khuvuc.create);
  router.get("/", isAuthenticated, ent_khuvuc.get);
  router.get("/:id", isAuthenticated, ent_khuvuc.getDetail);

  app.use("/api/ent_khuvuc", router);
};

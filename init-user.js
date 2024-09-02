db = db.getSiblingDB('guardian'); 

db.createUser({
    user: "adel",
    pwd: "123",  
    roles: [
        { role: "readWrite", db: "guardian" }
    ]
});

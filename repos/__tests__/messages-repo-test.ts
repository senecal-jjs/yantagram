// import SQMessageRepository from "../impls/sq-messages-repository";
// const { Database } = require("sqlite-async");

// let db; // Declare db in a scope accessible by tests

// beforeEach(async () => {
//   // db = await open({
//   //   filename: ":memory:",
//   //   driver: sqlite3.Database,
//   // });
//   db = await Database.open(":memory:"); // Open in-memory database
//   // Perform schema setup or migrations here if needed
// });

// afterEach(async () => {
//   await db.close(); // Close the in-memory database after each test
// });

// test("save message", async () => {
//   const repo = new SQMessageRepository(db);

//   repo.create({
//     contents: "Hello",
//     deliveryStatus: 0,
//     id: "5f022f75-3bad-45f7-83ff-9772cb759939",
//     isPrivate: true,
//     isRelay: false,
//     originalSender: "1",
//     recipientNickname: "ace",
//     sender: "1",
//     senderPeerId: "142,38,212,204,51,22,14,126",
//     timestamp: 1763427040542,
//   });
// });

test.skip("skip", () => {});

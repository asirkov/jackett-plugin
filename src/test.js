console.log("=== START TEST === PID:", process.pid);
let n = 0;
setInterval(() => {
  console.log("tick", ++n);
}, 2000);
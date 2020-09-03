'use strict';
const BootBot = require('bootbot');
const Pool = require('pg').Pool;
const axios = require('axios');

const pool = new Pool({
    user: process.env.db_user,
    host: process.env.db_host,
    database: process.env.db_db,
    password: process.env.db_pass,
    port: process.env.db_port
})

const bot = new BootBot({
    accessToken: process.env.access_token,
    verifyToken: process.env.verify_token,
    appSecret: process.env.app_secret
});


bot.setGreetingText('Welcome to BootBot. What are you looking for? Say Get started or hi');
/*bot.setGetStartedButton((payload, chat) => {
    chat.say('Welcome to BootBot. What are you looking for? Say Get started or hi');
});*/

bot.hear(['Get Started','hello', 'hi', /hey( there)?/i], (payload, chat) => {
    chat.say('Hi there! I am your helping bot MeetnGreet to help you and your ' +
        'friends meet effortlessly. If you want to host a room press ' +
        'Create Session or if you want to join a room created by your ' +
        'friend then click Join Session. ' +
        'If you want to exit anytime type "end"',{typing:true}).then(()=>{
        chat.conversation((convo) =>{
            convo.sendTypingIndicator(1000).then(() => askType(convo));
        });
    });
});

const askType = (convo) => {
    convo.ask((convo) => {
        const buttons = [
            { type: 'postback', title: 'Create Session', payload: 'CREATE_SESSION' },
            { type: 'postback', title: 'Join Session', payload: 'JOIN_SESSION' }
        ];
        convo.sendButtonTemplate('How can I help you?',buttons);
    }, (payload, convo, data) => {
        const text = payload.message.text;
        if(text.toLowerCase() === 'create session' ){
            convo.set('state', 'host');
            createKey(convo);
        } else if(text.toLowerCase() === 'join session'){
            convo.set('state', 'joint');
            askKey(convo);
        }else if(text.toLowerCase() === 'end'){
            convo.end();
        } else{
            convo.say('We couldn\'t catch what you just said. If you want to end the conversation type end').then(()=> askType(convo) );
        }

    },[
        {
            event: 'postback:CREATE_SESSION',
            callback: (payload, convo) => {
                convo.set('state', 'host');
                createKey(convo);
            }
        },
        {
            event: 'postback:JOIN_SESSION',
            callback: (payload, convo) => {
                convo.set('state', 'joint');
                askKey(convo);
            }
        }
    ]);
};

const createKey = (convo) =>{
    var key = makeid(10);
   // convo.say(`Your session key is ${key} , share this to your friend`);
    convo.getUserProfile().then((user) =>{
        const name = user.first_name+' '+user.last_name;
        convo.set('name',name);
        convo.set('key',key);
        convo.set('id',user.id);
        sendGIF(convo);
    });
}


const sendGIF = (convo) =>{
    convo.say({
        attachment: 'image',
        url: 'https://raw.githubusercontent.com/TamimEhsan/TamimEhsan/master/Assets/SendLocation.gif'
    }).then(()=>{
        askLocation(convo);
    });
}

const askLocation = (convo) =>{
    convo.ask('Whats your location', (payload, convo) => {
        console.log(payload.message.text);
        if( payload.message.text === "end" ){
            convo.end();
        } else{
            convo.say('Please send the location pin as the gif states. If you want to end the conversation type end').then(()=>{
                askLocation(convo);
            });
        }

    }, [
        {
            event: 'attachment',
            callback: (payload, convo) => {
                const text = payload.message.attachments[0].payload["coordinates"];
                if( text === undefined ){
                    convo.say('Please send the location pin as the gif states. If you want to end the conversation type end').then(()=>{
                        askLocation(convo);
                    });
                }
                console.log("Lat: "+text.lat);
                console.log("Long: "+text.long);


                const query = {
                    text: 'INSERT INTO meet(user_id,user_name,key,state,lat,long) VALUES($1,$2,$3,$4,$5,$6)',
                    values: [convo.get('id'),convo.get('name'),convo.get('key'),convo.get('state'),text.lat,text.long]
                };
                pool.query(query).then((res)=>{
                    if( convo.get('state') != 'host' ){
                        const query2 = {
                            text: `SELECT * FROM meet WHERE key = '${convo.get('key')}' AND state = 'host'`
                        };
                        pool.query(query2).then((res2)=>{
                            bot.sendTextMessage(res2.rows[0].user_id, convo.get('name')+' has entered your session');
                        }).catch((error)=>{
                            console.log(error.message);
                        });
                        convo.say('Your information have been added to the room. Please wait till the owner ends the session. ' +
                            'Thank you for staying with us.')
                        convo.end();
                    } else{
                        convo.say('Share the key with your firends. Your key is '+convo.get('key')).then(()=>{
                            waitToEnd(convo);
                        });

                    }
                }).catch((error)=>{
                    console.log(error.message);
                })


            }
        }
    ]);
};

const waitToEnd = (convo) => {
    convo.ask((convo) => {
        const buttons = [
            { type: 'postback', title: 'End Session', payload: 'END_SESSION' }
        ];
        convo.sendButtonTemplate('When you are ready press this',buttons);
    }, (payload, convo, data) => {
        const text = payload.message.text;
        if(text.toLowerCase() === 'end session' ){
            calculatePoint(convo);
        }else{
            convo.say('We couldn\'t catch what you just said.').then(()=> waitToEnd(convo) );
        }

    },[
        {
            event: 'postback:END_SESSION',
            callback: (payload, convo) => {
                calculatePoint(convo);
            }
        }
    ]);
};

function getMedian(arr) {
    arr.sort();
    var n = arr.length;
    if (n%2 == 0) {
        var i = Math.floor(n/2);
        return (arr[i] + arr[i-1])/2;
    }
    else {
        var i = Math.floor(n/2);
        return arr[i];
    }
}

const calculatePoint = (convo) =>{
    console.log("debug");
    const query = {
        text: `SELECT * FROM meet WHERE key = '${convo.get('key')}'`
	/*text: `SELECT AVG(lat) AS lat, AVG(long) AS long
		FROM users
		WHERE key = '${convo.get('key')}'
	UNION	SELECT id,user_id,
		FROM users
		WHERE key = '${convo.get('key')}'`*/
    }
    const key = convo.get('key');
    pool.query(query).then((res)=>{
        var lat = 0.0,long = 0.0;
        var lat_list = [];
        var long_list = [];
        for(var i=0;i<res.rows.length;i++){
            lat_list.push(res.rows[i].lat*1.0);
            long_list.push(res.rows[i].long*1.0);
            //lat+=res.rows[i].lat*1.0;
            //long+=res.rows[i].long*1.0;
        }
        lat = getMedian(lat_list);
        long = getMedian(long_list);
        console.log('here I am'+lat+" "+long);
       /* for(var i=0;i<res.rows.length;i++){
            bot.sendTextMessage(res.rows[i].user_id,`Your destination is Lat: ${lat} and Long: ${long}`);
        }*/
	//console.log(res);
		
        sendLocation(lat,long,res.rows);
        convo.end();
    }).then(()=>{
        pool.query(`DELETE
                    FROM meet
                    WHERE key = '${key}'
        `).then((result)=>{

        });
    });

}


const askKey = (convo) =>{
    convo.ask('Enter the session key provided by your friend' +
        ' . If you do not have one then ask your friend for one or ' +
        'create your own session',(payload,convo)=>{
        const key = payload.message.text;
        if( key === "end" ){
            convo.end();
            return ;
        }
        console.log(key);
        convo.set('key',key);
        const query = {
            text: `SELECT * FROM meet WHERE key = '${key}' AND state = 'host'`
        };
        pool.query(query).then((result)=>{
            if( result.rows.length === 0 ){
                convo.say('There are no room for this particular key').then(()=>{
                    askKey(convo);
                });
            }else{
                convo.say('You are joining the session of '+result.rows[0].user_name).then(()=>{
                    saveData(convo);
                });
            }

        }).catch((error)=>{
            console.log(error.message);
        })
    })
};

const saveData = (convo) =>{
    convo.getUserProfile().then((user) =>{
        const name = user.first_name+' '+user.last_name;
        convo.set('name',name);
        convo.set('id',user.id);
        sendGIF(convo);
    });
};

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}


async function sendLocation(lat,long,dataRows){
	 var lat7 = lat.toFixed(7);
    var long7 = long.toFixed(7);
    try{
        var response;
		response = await axios.get('https://us1.locationiq.com/v1/reverse.php', {
            params: {
                key: '5e137deebf37dc',
                format: 'json',
                lat: lat7,
                lon: long7
            }
        });
       // console.log(response.data);
        const location = response.data.display_name;
        console.log(lat+" "+long);
        
        console.log(lat7+" "+long7);
        for(var i=0;i<dataRows.length;i++){
            await bot.sendTextMessage(dataRows[i].user_id,"Meet at "+location);
            var latt = dataRows[i].lat.toFixed(7);
            var longt = dataRows[i].long.toFixed(7);
            await bot.sendTextMessage(dataRows[i].user_id,`Location: https://www.google.com/maps/search/?api=1&query=${lat7},${long7}`);
          //  await bot.sendAttachment(dataRows[i].user_id,"file", `https://www.google.com/maps/search/?api=1&query=${lat7},${long7}`);
          //  await bot.sendAttachment(dataRows[i].user_id,"image", `https://www.google.com/maps/search/?api=1&query=${lat7},${long7}`);
            await bot.sendTextMessage(dataRows[i].user_id,`Route: https://www.google.com/maps/dir/?api=1&origin=${latt},${longt}&destination=${lat7},${long7}`);
			await bot.sendTextMessage(dataRows[i].user_id,'Thank you for using meet and greet! We hope you have a great time together! If you wish to meet again you know what to do! Just say Hi!');
        }
		
    } catch (error){
        console.log(error.message);
        const location = "Sorry, We couldn't find it";
		for(var i=0;i<dataRows.length;i++){
            await bot.sendTextMessage(dataRows[i].user_id,"Meet at "+location);
            var latt = dataRows[i].lat.toFixed(7);
            var longt = dataRows[i].long.toFixed(7);
            await bot.sendTextMessage(dataRows[i].user_id,`Location: https://www.google.com/maps/search/?api=1&query=${lat7},${long7}`);
          //  await bot.sendAttachment(dataRows[i].user_id,"file", `https://www.google.com/maps/search/?api=1&query=${lat7},${long7}`);
          //  await bot.sendAttachment(dataRows[i].user_id,"image", `https://www.google.com/maps/search/?api=1&query=${lat7},${long7}`);
            await bot.sendTextMessage(dataRows[i].user_id,`Route: https://www.google.com/maps/dir/?api=1&origin=${latt},${longt}&destination=${lat7},${long7}`);
			await bot.sendTextMessage(dataRows[i].user_id,'Thank you for using meet and greet! We hope you have a great time together! If you wish to meet again you know what to do! Just say Hi!');
        }
    }
}


const port=process.env.port||3000
bot.start(port);
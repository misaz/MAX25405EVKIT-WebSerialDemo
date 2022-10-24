/// <reference path="w3c-web-serial.d.ts" />

function log(message: string) {
	var p = document.createElement("p");
	p.textContent = message;
	document.body.appendChild(p);
}

async function serialReadLine(reader: ReadableStreamDefaultReader<Uint8Array>) {
	var message = "";
	var completed = false;
	while (!completed && message.indexOf("\n") == -1) {
		var output = await reader.read();
		if (output.done) {
			completed = true;
		} else {
			var received = new TextDecoder().decode(output.value);
			//log("Received: " + received);
			message = message + received;
		}
	}
	return message;
}

var table = document.querySelector("table");
var button = document.getElementById("btnConnect");

if (!navigator.serial) {
	log("Your Web Browser do not support WebSerial API. At the time of creating this app only Chrome and Edge supported this API.")
}

button.onclick = async () => {
	log("Requesting WebSerial permissions.");
	await navigator.serial.requestPort({
		filters: [
			{
				usbVendorId: 0x0B6A, // Maxim Integrated
				usbProductId: 0x4360 // MAX32620 MCU with MAX25405EVKIT firmware
			}
		]
	});

	log("Getting ports.");
	var serialPorts = await navigator.serial.getPorts();

	log("Searched " + serialPorts.length.toString() + " ports.");
	for (var i = 0; i < serialPorts.length; i++) {

		log("Opening port");
		await serialPorts[i].open({ baudRate: 115200 });

		if (!serialPorts[i].readable) {
			log("port is not readable.");
			continue;
		}

		if (!serialPorts[i].writable) {
			log("port is not writable.");
			continue;
		}

		var writer = serialPorts[i].writable.getWriter();
		var reader = serialPorts[i].readable.getReader();

		log("Sending ver command.");
		await writer.write(new TextEncoder().encode("ver\n"));

		log("Received output: " + await serialReadLine(reader));

		log("Starting Heat Map");
		redrawHeatMap(reader, writer);

		break;
	}
}

async function redrawHeatMap(reader: ReadableStreamDefaultReader<Uint8Array>, writer: WritableStreamDefaultWriter<Uint8Array>) {
	await writer.write(new TextEncoder().encode("reg read 0x10 120\n"));
	var output = await serialReadLine(reader);
	var bytes = output.split(" ").map((x) => Number.parseInt(x, 16));

	for (var y = 0; y < 6; y++) {
		for (var x = 0; x < 10; x++) {
			// values are encoded as signed 16-bit integer encoded using BIG endian.
			var byte1 = bytes[2 * (y * 10 + x)];
			var byte2 = bytes[2 * (y * 10 + x) + 1];
			var valueRaw = (byte1 << 8) | byte2;
			var value = valueRaw;
			if (byte1 & 0x80) {
				value = ~valueRaw + 1;
			}

			if (value < 0) {
				value = 0;
			}

			if (value > 4000) {
				value = 4000;
			}

			var pixelValue = 255 * value / 4000;

			var cell = table.children[0].children[y].children[x] as HTMLTableCellElement;
			cell.style.backgroundColor = "rgb(0, " + Math.round(pixelValue) + ", 0)";
		}
	}

	setTimeout(redrawHeatMap.bind(window, reader, writer), 20);
}